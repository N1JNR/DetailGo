import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

import { resolveAsaasConfig } from './asaasConfig';
import { autorizarDonoDoShop } from './shopOwnerGuard';
import { lerAssinatura, limparAssinatura } from './shopBilling';
import { toSubscriptionView, type AsaasSubscription } from './asaasSubscriptionView';

const asaasApiKey = defineSecret('ASAAS_API_KEY');

/** Situação da assinatura, para a tela do dono. */
export const getAsaasSubscription = onRequest(
  { secrets: [asaasApiKey], cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    try {
      const db = admin.firestore();
      const auth = await autorizarDonoDoShop(req, db);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      // O id vem de shopBilling, que o cliente não escreve — e não do documento
      // da loja, que o dono edita. Ler de lá deixava qualquer dono consultar a
      // assinatura de outra estética só gravando o id dela no próprio shop.
      const subscriptionId = await lerAssinatura(db, auth.shopId);
      // Sem assinatura é caso normal, não erro: quem pagou por Pix cai aqui.
      if (!subscriptionId) {
        res.status(200).json({ assinatura: null });
        return;
      }

      const config = resolveAsaasConfig(asaasApiKey.value());
      const resposta = await fetch(`${config.baseUrl}/subscriptions/${subscriptionId}`, {
        headers: { access_token: asaasApiKey.value() },
      });

      // 404 significa que a assinatura sumiu do lado do Asaas. Para a tela é o
      // mesmo que não ter — ela oferece assinar de novo.
      if (resposta.status === 404) {
        res.status(200).json({ assinatura: null });
        return;
      }

      if (!resposta.ok) {
        logger.error(`Asaas recusou a consulta (${resposta.status})`, await resposta.text());
        res.status(502).json({ error: 'Não foi possível carregar a assinatura.' });
        return;
      }

      const assinatura = (await resposta.json()) as AsaasSubscription;
      res.status(200).json({ assinatura: toSubscriptionView(assinatura) });
    } catch (error) {
      logger.error('Erro ao consultar assinatura:', error);
      res.status(500).json({ error: 'Não foi possível carregar a assinatura.' });
    }
  },
);

/**
 * Cancela a assinatura recorrente.
 *
 * Não mexe no activeUntil de propósito: o dono pagou por aqueles dias e
 * continua usando até o fim do período. O Asaas para de cobrar e o acesso
 * expira sozinho, sem agendador nem estado intermediário.
 */
export const cancelAsaasSubscription = onRequest(
  { secrets: [asaasApiKey], cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    try {
      const db = admin.firestore();
      const auth = await autorizarDonoDoShop(req, db);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      // Mesma razão da consulta: o id tem que vir de onde o chamador não
      // escreve, senão cancelar a assinatura de outra estética é só gravar o id
      // dela no próprio documento.
      const subscriptionId = await lerAssinatura(db, auth.shopId);
      if (!subscriptionId) {
        res.status(400).json({ error: 'Nenhuma assinatura para cancelar.' });
        return;
      }

      const config = resolveAsaasConfig(asaasApiKey.value());
      const resposta = await fetch(`${config.baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: { access_token: asaasApiKey.value() },
      });

      // Já não existir é o resultado desejado: seguimos para limpar a
      // referência, senão a tela continuaria mostrando uma assinatura fantasma.
      if (!resposta.ok && resposta.status !== 404) {
        logger.error(`Asaas recusou o cancelamento (${resposta.status})`, await resposta.text());
        res.status(502).json({ error: 'Não foi possível cancelar. Tente de novo.' });
        return;
      }

      await limparAssinatura(db, auth.shopId);

      logger.info(`Assinatura cancelada: shop=${auth.shopId} sub=${subscriptionId}`);
      res.status(200).json({ cancelada: true });
    } catch (error) {
      logger.error('Erro ao cancelar assinatura:', error);
      res.status(500).json({ error: 'Não foi possível cancelar. Tente de novo.' });
    }
  },
);
