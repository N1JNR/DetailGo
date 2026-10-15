import * as admin from 'firebase-admin';

import { shopIdValido } from './shopBilling';

export type ShopAutorizado =
  | { ok: true; shopId: string; shop: admin.firestore.DocumentData }
  | { ok: false; status: number; error: string };

/**
 * Confere que quem chamou é o dono do shop informado.
 *
 * Extraído porque três functions de pagamento precisam da mesma trava, e
 * repetir esse trecho é como uma delas acaba esquecendo a checagem de ownerId
 * — que é o que separa "ver a própria assinatura" de "cancelar a de outro".
 */
export async function autorizarDonoDoShop(
  req: { headers: Record<string, unknown>; body: unknown },
  db: admin.firestore.Firestore,
): Promise<ShopAutorizado> {
  const authHeader = String(req.headers.authorization ?? '');
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return { ok: false, status: 401, error: 'Token não fornecido.' };

  const { uid } = await admin.auth().verifyIdToken(idToken);

  const { shopId } = (req.body ?? {}) as { shopId?: unknown };
  if (!shopId) return { ok: false, status: 400, error: 'shopId é obrigatório.' };

  // Formato antes de montar o caminho: com barra dentro, `shops/${shopId}`
  // aponta para outro documento — `a/settings/b` vira `shops/a/settings/b`, que
  // é caminho de documento válido e fica sob uma subcoleção que o dono escreve.
  if (!shopIdValido(shopId)) return { ok: false, status: 400, error: 'shopId inválido.' };

  const snap = await db.doc(`shops/${shopId}`).get();
  if (!snap.exists) return { ok: false, status: 404, error: 'Loja não encontrada.' };

  const shop = snap.data() as admin.firestore.DocumentData;
  if (shop.ownerId !== uid) return { ok: false, status: 403, error: 'Acesso negado.' };

  return { ok: true, shopId, shop };
}
