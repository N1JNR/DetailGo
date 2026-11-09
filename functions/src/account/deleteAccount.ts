import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

import { avaliarExclusao, type FatosDaConta } from './impedimentos';

/**
 * Exclusão de conta e dados, exigida pelo Google Play de todo app que permite
 * criar conta.
 *
 * Roda no servidor porque três coisas aqui o cliente não consegue fazer: apagar
 * a conta do Firebase Auth, escrever nos agendamentos de outra estética (as
 * regras só deixam o cliente cancelar o próprio) e varrer `collectionGroup`.
 */

/** Lotes do Firestore aceitam 500 escritas. */
const TAMANHO_DO_LOTE = 400;

/** Nome mostrado no lugar de quem saiu, nos relatórios da estética. */
export const CLIENTE_REMOVIDO = '';

async function contarAgendamentosFuturos(
  db: admin.firestore.Firestore,
  shopId: string,
  agoraMs: number,
): Promise<number> {
  const snap = await db
    .collection('shops')
    .doc(shopId)
    .collection('appointments')
    .where('status', '==', 'scheduled')
    .where('startAtMs', '>=', agoraMs)
    .count()
    .get();
  return snap.data().count;
}

async function coletarFatos(
  db: admin.firestore.Firestore,
  uid: string,
  agoraMs: number,
): Promise<FatosDaConta> {
  const userSnap = await db.doc(`users/${uid}`).get();
  const papel = (userSnap.data()?.role as FatosDaConta['papel']) ?? null;

  // A loja vem por ownerId, não pelo `shopId` do usuário: nele o cliente grava
  // a última estética usada, e confundir os dois prenderia cliente nenhum dono.
  const lojas = await db.collection('shops').where('ownerId', '==', uid).limit(1).get();
  const shopId = lojas.empty ? null : lojas.docs[0].id;

  if (!shopId) {
    return { papel, shopId: null, assinaturaAtiva: false, agendamentosFuturos: 0 };
  }

  const billing = await db.doc(`shopBilling/${shopId}`).get();
  const assinatura = billing.data()?.asaasSubscriptionId;

  return {
    papel,
    shopId,
    assinaturaAtiva: typeof assinatura === 'string' && assinatura.length > 0,
    agendamentosFuturos: await contarAgendamentosFuturos(db, shopId, agoraMs),
  };
}

/** Apaga todos os documentos de uma consulta, em lotes. */
async function apagarEmLotes(
  db: admin.firestore.Firestore,
  consulta: admin.firestore.Query,
): Promise<number> {
  let apagados = 0;
  for (;;) {
    const snap = await consulta.limit(TAMANHO_DO_LOTE).get();
    if (snap.empty) return apagados;

    const lote = db.batch();
    snap.docs.forEach(d => lote.delete(d.ref));
    await lote.commit();
    apagados += snap.size;

    if (snap.size < TAMANHO_DO_LOTE) return apagados;
  }
}

/**
 * Tira o nome de quem saiu dos agendamentos da estética, mantendo o registro.
 *
 * O `customerUid` fica: ele agrupa os relatórios de cliente recorrente
 * (`clientes.ts`), e depois que `users/{uid}` e a conta de Auth somem ele não
 * aponta mais para pessoa nenhuma — vira código opaco. Apagar o agendamento
 * inteiro mudaria o faturamento já realizado da estética, que é dado dela.
 */
async function anonimizarAgendamentos(db: admin.firestore.Firestore, uid: string): Promise<number> {
  let anonimizados = 0;
  for (;;) {
    const snap = await db
      .collectionGroup('appointments')
      .where('customerUid', '==', uid)
      .limit(TAMANHO_DO_LOTE)
      .get();

    // A consulta pega as duas pontas: `shops/{id}/appointments` e a cópia em
    // `users/{uid}/appointments`. A do usuário é apagada depois, então deixar
    // ela passar por aqui não atrapalha.
    const alvos = snap.docs.filter(d => d.get('customerName') !== CLIENTE_REMOVIDO);
    if (alvos.length === 0) return anonimizados;

    const lote = db.batch();
    alvos.forEach(d => lote.update(d.ref, { customerName: CLIENTE_REMOVIDO }));
    await lote.commit();
    anonimizados += alvos.length;
  }
}

async function apagarFotoDePerfil(uid: string): Promise<void> {
  try {
    await admin.storage().bucket().file(`users/${uid}/profile.jpg`).delete();
  } catch {
    // Quem nunca enviou foto não tem arquivo — não é erro.
  }
}

export const deleteAccount = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const authHeader = String(req.headers.authorization ?? '');
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
      res.status(401).json({ error: 'Token não fornecido.' });
      return;
    }

    // `checkRevoked` aqui e não nas outras functions: isto é irreversível, e o
    // custo de recusar um token recém-revogado é a pessoa logar de novo.
    const { uid } = await admin.auth().verifyIdToken(idToken, true);

    const db = admin.firestore();
    const fatos = await coletarFatos(db, uid, Date.now());
    const veredito = avaliarExclusao(fatos);

    if (!veredito.pode) {
      res.status(409).json({ error: 'Resolva isto antes.', impedimentos: veredito.impedimentos });
      return;
    }

    await anonimizarAgendamentos(db, uid);

    if (veredito.apagaLoja && fatos.shopId) {
      const loja = db.collection('shops').doc(fatos.shopId);
      for (const sub of ['appointments', 'services', 'settings', 'slots', 'notifications']) {
        await apagarEmLotes(db, loja.collection(sub));
      }
      await db.doc(`shopBilling/${fatos.shopId}`).delete();
      await loja.delete();
    }

    const usuario = db.collection('users').doc(uid);
    await apagarEmLotes(db, usuario.collection('appointments'));
    await apagarEmLotes(db, usuario.collection('notifications'));
    await usuario.delete();

    await apagarFotoDePerfil(uid);

    // Por último: enquanto a conta de Auth existe, dá para tentar de novo se
    // algo acima falhar. Apagá-la primeiro deixaria dado órfão sem dono.
    await admin.auth().deleteUser(uid);

    logger.info(`Conta excluida: uid=${uid} loja=${veredito.apagaLoja ? fatos.shopId : 'nenhuma'}`);
    res.status(200).json({ excluida: true });
  } catch (error) {
    logger.error('Falha ao excluir conta:', error);
    res.status(500).json({ error: 'Não foi possível excluir a conta agora.' });
  }
});
