import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

import { avaliarExclusao, type FatosDaConta } from './impedimentos';
import { apagarTudo, porLote } from './varredura';

/**
 * Exclusão de conta e dados, exigida pelo Google Play de todo app que permite
 * criar conta.
 *
 * Roda no servidor porque três coisas aqui o cliente não consegue fazer: apagar
 * a conta do Firebase Auth, escrever nos agendamentos de outra estética (as
 * regras só deixam o cliente cancelar o próprio) e varrer `collectionGroup`.
 */

/**
 * Valor gravado em `customerName` de quem saiu.
 *
 * Vazio, e não um rótulo como "Cliente removido": quem decide o que aparecer é
 * a tela de relatórios, que já troca nome vazio por `SEM_NOME`
 * (`src/features/reports/domain/clientes.ts`). Gravar texto aqui duplicaria
 * essa decisão em dois lugares, e eles divergiriam.
 */
export const NOME_ANONIMO = '';

/**
 * Subcoleções de `shops/{shopId}`.
 *
 * Espelha os `match` de `firestore.rules`. Apagar o documento da loja **não**
 * apaga subcoleção no Firestore, então uma que falte aqui vira órfã invisível.
 * Ao criar subcoleção nova, acrescente nos dois lugares.
 */
const SUBCOLECOES_DA_LOJA = [
  'appointments',
  'services',
  'settings',
  'slots',
  'notifications',
] as const;

/** Prova de identidade recente exigida para apagar a conta. */
const SEGUNDOS_DE_VALIDADE_DO_LOGIN = 5 * 60;

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

/**
 * Tira o nome de quem saiu dos agendamentos das estéticas, mantendo o registro.
 *
 * Só alcança `shops/{id}/appointments`: a cópia em `users/{uid}/appointments`
 * **não grava `customerUid`** (ver `availability.service.ts`), então não entra
 * nesta consulta — e não precisa, porque ela é apagada inteira adiante.
 *
 * O `customerUid` fica: ele agrupa os relatórios de cliente recorrente, e
 * depois que `users/{uid}` e a conta de Auth somem ele não aponta mais para
 * pessoa nenhuma. Apagar o agendamento inteiro mudaria o faturamento já
 * realizado da estética, que é dado dela.
 */
function anonimizarAgendamentos(db: admin.firestore.Firestore, uid: string): Promise<number> {
  return porLote(
    db,
    db.collectionGroup('appointments').where('customerUid', '==', uid),
    (lote, doc) => lote.update(doc.ref, { customerName: NOME_ANONIMO }),
  );
}

/**
 * Apaga a cópia que cada cliente guarda dos agendamentos desta loja.
 *
 * Sem isto, quem já atendeu aqui fica com agendamento no histórico apontando
 * para uma estética que não existe mais — e a tela da loja trava no carregando,
 * porque ela só sai de lá quando o documento aparece.
 */
function apagarCopiasDosClientes(db: admin.firestore.Firestore, shopId: string): Promise<number> {
  return porLote(db, db.collection('shops').doc(shopId).collection('appointments'), (lote, doc) => {
    const customerUid = doc.get('customerUid');
    if (typeof customerUid !== 'string' || !customerUid) return;
    lote.delete(db.collection('users').doc(customerUid).collection('appointments').doc(doc.id));
  });
}

/**
 * Apaga tudo que a pessoa guardou no Storage, não só a foto de perfil.
 *
 * Por prefixo de propósito: apagar `profile.jpg` pelo nome deixaria para trás
 * qualquer arquivo que passe a existir sob `users/{uid}/`, numa função cujo
 * nome promete apagar os dados.
 */
async function apagarArquivos(uid: string): Promise<void> {
  try {
    await admin
      .storage()
      .bucket()
      .deleteFiles({ prefix: `users/${uid}/` });
  } catch (error) {
    // Quem nunca enviou arquivo não tem prefixo — não é erro.
    logger.debug('Nada a apagar no Storage, ou falha ao apagar:', error);
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
    const token = await admin.auth().verifyIdToken(idToken, true);

    // O `deleteUser` do Admin SDK não exige login recente — isso só vale no
    // cliente. Sem esta checagem, um token vazado (válido por até uma hora)
    // apagaria a conta, enquanto TROCAR O E-MAIL no app pede a senha. A ação
    // mais destrutiva não pode exigir menos prova que a menos destrutiva.
    const segundosDesdeOLogin = Date.now() / 1000 - token.auth_time;
    if (segundosDesdeOLogin > SEGUNDOS_DE_VALIDADE_DO_LOGIN) {
      res.status(401).json({ error: 'Confirme sua senha para continuar.', codigo: 'reautenticar' });
      return;
    }

    const uid = token.uid;
    const db = admin.firestore();
    const fatos = await coletarFatos(db, uid, Date.now());
    const veredito = avaliarExclusao(fatos);

    if (!veredito.pode) {
      res.status(409).json({ error: 'Resolva isto antes.', impedimentos: veredito.impedimentos });
      return;
    }

    const anonimizados = await anonimizarAgendamentos(db, uid);

    if (veredito.apagaLoja && fatos.shopId) {
      const loja = db.collection('shops').doc(fatos.shopId);

      // Antes de apagar os agendamentos da loja: é deles que sai o uid de cada
      // cliente cuja cópia precisa sumir junto.
      await apagarCopiasDosClientes(db, fatos.shopId);

      for (const sub of SUBCOLECOES_DA_LOJA) {
        await apagarTudo(db, loja.collection(sub));
      }
      await db.doc(`shopBilling/${fatos.shopId}`).delete();
      await loja.delete();
    }

    const usuario = db.collection('users').doc(uid);
    await apagarTudo(db, usuario.collection('appointments'));
    await apagarTudo(db, usuario.collection('notifications'));
    await usuario.delete();

    await apagarArquivos(uid);

    // Por último: enquanto a conta de Auth existe, dá para tentar de novo se
    // algo acima falhar. Apagá-la primeiro deixaria dado órfão sem dono.
    await admin.auth().deleteUser(uid);

    // Sem o uid no log: ele identifica quem pediu para ser esquecido, e o Cloud
    // Logging guarda por muito mais tempo que o Firestore.
    logger.info(
      `Conta excluida: loja=${veredito.apagaLoja ? 'sim' : 'nao'} agendamentos=${anonimizados}`,
    );
    res.status(200).json({ excluida: true });
  } catch (error) {
    logger.error('Falha ao excluir conta:', error);
    res.status(500).json({ error: 'Não foi possível excluir a conta agora.' });
  }
});
