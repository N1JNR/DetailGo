import * as admin from 'firebase-admin';

/**
 * Vínculo da estética com o Asaas, fora do alcance do cliente.
 *
 * Mora em `shopBilling/{shopId}`, que as regras fecham dos dois lados
 * (`allow read, write: if false`). Só o Admin SDK das Functions escreve aqui.
 *
 * Antes isto vivia em `shops/{shopId}`, que o dono pode editar. A Cloud
 * Function de cancelamento conferia que o DOCUMENTO era do chamador, e então
 * usava o `asaasSubscriptionId` de dentro dele — sem conferir que o ID também
 * era. Bastava o dono gravar no próprio documento o id de outra estética (que
 * era legível, porque `shops` era público) para cancelar a assinatura alheia.
 */

/** Formato de id que o Firestore gera e que aceitamos como shopId. */
const SHOP_ID_VALIDO = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Recusa shopId que não seja um único segmento de caminho.
 *
 * `db.doc('shops/' + shopId)` com barra dentro do shopId vira outro documento:
 * `a/settings/b` resolve para `shops/a/settings/b`, que é caminho válido de
 * documento. Como o dono pode escrever em `shops/{id}/settings/{doc}`, dava
 * para forjar um documento com o ownerId dele e o id de assinatura de outro.
 */
export function shopIdValido(shopId: unknown): shopId is string {
  return typeof shopId === 'string' && SHOP_ID_VALIDO.test(shopId);
}

/** Id da assinatura recorrente da estética, ou null se ela não tem uma. */
export async function lerAssinatura(
  db: admin.firestore.Firestore,
  shopId: string,
): Promise<string | null> {
  const snap = await db.doc(`shopBilling/${shopId}`).get();
  if (!snap.exists) return null;

  const id = snap.data()?.asaasSubscriptionId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Campos que o webhook grava quando um pagamento é confirmado. */
export type RegistroDeCobranca = {
  /** Só vem quando o pagamento nasceu de assinatura (cartão). */
  asaasSubscriptionId?: string;
  lastPaymentId: string;
};

/**
 * Grava o vínculo dentro da transação do webhook.
 *
 * `asaasSubscriptionId` só é tocado quando o evento traz assinatura: Pix é
 * cobrança avulsa e não tem subscription, e escrever null aqui apagaria a
 * recorrência de quem só quis adiantar um mês no cartão.
 */
export function gravarCobranca(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  shopId: string,
  registro: RegistroDeCobranca,
): void {
  tx.set(
    db.doc(`shopBilling/${shopId}`),
    {
      shopId,
      lastPaymentId: registro.lastPaymentId,
      lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(registro.asaasSubscriptionId
        ? { asaasSubscriptionId: registro.asaasSubscriptionId }
        : {}),
    },
    { merge: true },
  );
}

/** Apaga a recorrência depois de cancelar no Asaas. */
export async function limparAssinatura(
  db: admin.firestore.Firestore,
  shopId: string,
): Promise<void> {
  await db.doc(`shopBilling/${shopId}`).set(
    {
      asaasSubscriptionId: admin.firestore.FieldValue.delete(),
      canceladaEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
