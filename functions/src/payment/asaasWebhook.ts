import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

import { isValidAsaasToken } from './asaasWebhookToken';
import { decideFromEvent, nextActiveUntil } from './asaasEvents';
import { gravarCobranca, shopIdValido } from './shopBilling';

const asaasWebhookToken = defineSecret('ASAAS_WEBHOOK_TOKEN');

export const asaasWebhook = onRequest({ secrets: [asaasWebhookToken] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Antes de qualquer trabalho: sem o token, a requisição não é do Asaas.
  if (!isValidAsaasToken(req.get('asaas-access-token'), asaasWebhookToken.value())) {
    logger.warn('Webhook Asaas recusado: token invalido ou ausente');
    res.status(401).send('Unauthorized');
    return;
  }

  try {
    const decisao = decideFromEvent(req.body ?? {});

    if (decisao.kind === 'ignore') {
      logger.debug(`Evento ignorado: ${decisao.reason}`);
      res.status(200).send('ok');
      return;
    }

    const db = admin.firestore();

    // A cobrança chega sem o externalReference do checkout; o vínculo vem pelo
    // checkoutSession, resolvido contra o que gravamos ao criar o checkout.
    const shopId = decisao.ref.shopId ?? (await resolveShopId(db, decisao.ref.checkoutSession));
    if (!shopId) {
      logger.warn(`Pagamento sem estetica identificada: payment=${decisao.paymentId}`);
      res.status(200).send('ok');
      return;
    }

    // O shopId chega do corpo do Asaas (externalReference) ou do documento de
    // checkout. Conferir o formato antes de montar caminho: barra dentro dele
    // aponta para outro documento, e aqui escrevemos com o Admin SDK, que passa
    // por cima das regras.
    if (!shopIdValido(shopId)) {
      logger.error(`Pagamento com shopId fora do formato: ${JSON.stringify(shopId)}`);
      res.status(200).send('ok');
      return;
    }

    const pagamentoRef = db.doc(`payments/${decisao.paymentId}`);

    if (decisao.kind === 'overdue') {
      await pagamentoRef.set(
        {
          paymentId: decisao.paymentId,
          shopId,
          status: 'overdue',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      // O acesso não cai aqui: o app dá 5 dias de carência a partir do
      // activeUntil, tempo em que o Asaas ainda retenta o cartão.
      logger.info(`Pagamento vencido: shop=${shopId} payment=${decisao.paymentId}`);
      res.status(200).send('ok');
      return;
    }

    const shopRef = db.doc(`shops/${shopId}`);

    // O Asaas reenvia o evento quando não recebe 200, então o mesmo pagamento
    // pode chegar duas vezes. Somar 30 dias de novo daria mês grátis.
    const jaConfirmado = await db.runTransaction(async tx => {
      const pagamento = await tx.get(pagamentoRef);
      if (pagamento.exists && pagamento.data()?.status === 'confirmed') return true;

      const shop = await tx.get(shopRef);
      if (!shop.exists) {
        logger.error(`Pagamento de shop inexistente: ${shopId}`);
        return true;
      }

      const now = new Date();
      const atual = shop.data()?.activeUntil?.toDate?.() as Date | undefined;

      tx.set(
        pagamentoRef,
        {
          paymentId: decisao.paymentId,
          shopId: shopId,
          value: decisao.value ?? null,
          status: 'confirmed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // No documento da loja ficam só os dois campos que o app lê para liberar
      // a tela. O vínculo com o Asaas vai para shopBilling, fechado ao cliente.
      tx.update(shopRef, {
        subscriptionStatus: 'active',
        activeUntil: admin.firestore.Timestamp.fromDate(nextActiveUntil(atual, now)),
      });

      gravarCobranca(tx, db, shopId, {
        asaasSubscriptionId: decisao.subscriptionId,
        lastPaymentId: decisao.paymentId,
      });

      return false;
    });

    if (jaConfirmado) {
      logger.info(`Evento repetido ignorado: payment=${decisao.paymentId}`);
    } else {
      logger.info(`Assinatura ativada: shop=${shopId} payment=${decisao.paymentId}`);
    }

    res.status(200).send('ok');
  } catch (error) {
    // 500 de propósito: o Asaas reenvia o evento. Responder 200 aqui perderia
    // o pagamento para sempre.
    logger.error('Erro no webhook Asaas:', error);
    res.status(500).send('error');
  }
});

/**
 * Traduz o id do checkout na estética que o originou.
 *
 * A associação é gravada quando o checkout é criado — ver createAsaasCheckout.
 * Sem ela não há como saber de quem é a cobrança, porque o Asaas devolve o
 * externalReference nulo no evento de pagamento.
 */
async function resolveShopId(
  db: admin.firestore.Firestore,
  checkoutSession: string | undefined,
): Promise<string | undefined> {
  if (!checkoutSession) return undefined;

  const snap = await db.doc(`asaasCheckouts/${checkoutSession}`).get();
  return snap.exists ? (snap.data()?.shopId as string | undefined) : undefined;
}
