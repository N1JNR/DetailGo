import * as admin from 'firebase-admin';

/**
 * Percorrer coleções grandes em lotes, sem deixar documento para trás.
 *
 * Separado da função de exclusão porque é aqui que mora o erro fácil: um laço
 * com `limit` e `for(;;)` **parece** paginar, mas sem cursor ele relê a mesma
 * página para sempre. Numa exclusão isso vira dado que fica, com resposta de
 * sucesso — o pior modo de falhar que existe num recurso de conformidade.
 */

/** Lotes do Firestore aceitam 500 escritas; 400 deixa margem. */
export const TAMANHO_DO_LOTE = 400;

/**
 * Teto de páginas por varredura — 160 mil documentos.
 *
 * Laço sem limite dentro de uma Cloud Function gira até o timeout se a
 * paginação quebrar, queimando leitura paga e segurando a conexão. Nenhuma
 * conta real chega perto disso, então estourar o teto é sinal de defeito, não
 * de volume — por isso levanta erro em vez de devolver em silêncio.
 */
export const MAX_PAGINAS = 400;

export class VarreduraSemFim extends Error {
  constructor() {
    super('Varredura excedeu o teto de páginas — paginação provavelmente quebrada.');
    this.name = 'VarreduraSemFim';
  }
}

type Pagina = admin.firestore.QuerySnapshot;
type Documento = admin.firestore.QueryDocumentSnapshot;

/**
 * Aplica `acao` a cada documento da consulta, em lotes, avançando por cursor.
 *
 * O cursor é o último documento da página anterior. Sem ele, a segunda consulta
 * devolveria a mesma página: `limit` recorta o começo, não continua de onde
 * parou.
 */
export async function porLote(
  db: admin.firestore.Firestore,
  consulta: admin.firestore.Query,
  acao: (lote: admin.firestore.WriteBatch, doc: Documento) => void,
): Promise<number> {
  let processados = 0;
  let cursor: Documento | undefined;

  for (let pagina_n = 0; ; pagina_n++) {
    if (pagina_n >= MAX_PAGINAS) throw new VarreduraSemFim();

    const pagina: Pagina = await (cursor
      ? consulta.startAfter(cursor).limit(TAMANHO_DO_LOTE).get()
      : consulta.limit(TAMANHO_DO_LOTE).get());

    if (pagina.empty) return processados;

    const lote = db.batch();
    pagina.docs.forEach(d => acao(lote, d));
    await lote.commit();

    processados += pagina.size;

    // Página incompleta significa fim: não há o que buscar depois dela.
    if (pagina.size < TAMANHO_DO_LOTE) return processados;

    cursor = pagina.docs[pagina.docs.length - 1];
  }
}

/**
 * Apaga tudo que a consulta devolve.
 *
 * Aqui o cursor é dispensável — o documento apagado some da consulta seguinte —
 * mas usar o mesmo caminho evita duas implementações de paginação, e é a
 * segunda que costuma nascer errada.
 */
export function apagarTudo(
  db: admin.firestore.Firestore,
  consulta: admin.firestore.Query,
): Promise<number> {
  return porLote(db, consulta, (lote, doc) => lote.delete(doc.ref));
}
