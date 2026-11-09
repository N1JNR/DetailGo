import { apagarTudo, porLote, TAMANHO_DO_LOTE, VarreduraSemFim } from './varredura';

type Doc = { id: string; dados: Record<string, unknown> };

/**
 * Firestore de mentira que pagina de verdade.
 *
 * `limit` recorta do começo e `startAfter` continua depois do cursor — que é
 * exatamente o comportamento real, e o que expõe o laço que relê a mesma
 * página. Um fake que devolvesse tudo de uma vez esconderia o defeito.
 */
function bancoFalso(docs: Doc[]) {
  const commits: string[][] = [];
  const estado = new Map(docs.map(d => [d.id, { ...d.dados }]));

  const consulta = (depoisDe?: string, teto = Infinity) => {
    const todos = [...estado.keys()].sort();
    const inicio = depoisDe ? todos.indexOf(depoisDe) + 1 : 0;
    const ids = todos.slice(inicio, inicio + teto);
    return {
      empty: ids.length === 0,
      size: ids.length,
      docs: ids.map(id => ({ id, ref: { id }, get: (c: string) => estado.get(id)?.[c] })),
    };
  };

  const montar = (depoisDe?: string, teto?: number) => ({
    startAfter: (d: { id: string }) => montar(d.id, teto),
    limit: (n: number) => montar(depoisDe, n),
    get: async () => consulta(depoisDe, teto),
  });

  const db = {
    batch: () => {
      const operacoes: Array<() => void> = [];
      const tocados: string[] = [];
      return {
        delete: (ref: { id: string }) => {
          tocados.push(ref.id);
          operacoes.push(() => estado.delete(ref.id));
        },
        update: (ref: { id: string }, campos: Record<string, unknown>) => {
          tocados.push(ref.id);
          operacoes.push(() => Object.assign(estado.get(ref.id)!, campos));
        },
        commit: async () => {
          operacoes.forEach(o => o());
          commits.push(tocados);
        },
      };
    },
  };

  return { db: db as never, consulta: montar() as never, estado, commits };
}

const criar = (n: number, prefixo = 'd') =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefixo}${String(i).padStart(4, '0')}`,
    dados: { customerName: 'Jorge' },
  }));

describe('porLote', () => {
  it('não faz nada quando não há documento', async () => {
    const b = bancoFalso([]);

    expect(await porLote(b.db, b.consulta, () => {})).toBe(0);
    expect(b.commits).toEqual([]);
  });

  it('processa tudo numa página só quando cabe', async () => {
    const b = bancoFalso(criar(3));

    const n = await porLote(b.db, b.consulta, (lote, d) =>
      lote.update(d.ref, { customerName: '' }),
    );

    expect(n).toBe(3);
    expect(b.commits).toHaveLength(1);
    expect([...b.estado.values()].every(d => d.customerName === '')).toBe(true);
  });

  // O defeito que isto existe para pegar: sem cursor, a segunda consulta
  // devolve a MESMA página, e tudo além do primeiro lote fica para trás com
  // resposta de sucesso.
  it('atravessa várias páginas sem perder documento', async () => {
    const total = TAMANHO_DO_LOTE * 2 + 37;
    const b = bancoFalso(criar(total));

    const n = await porLote(b.db, b.consulta, (lote, d) =>
      lote.update(d.ref, { customerName: '' }),
    );

    expect(n).toBe(total);
    expect([...b.estado.values()].filter(d => d.customerName !== '')).toHaveLength(0);
  });

  it('divide em lotes do tamanho certo', async () => {
    const b = bancoFalso(criar(TAMANHO_DO_LOTE + 5));

    await porLote(b.db, b.consulta, (lote, d) => lote.update(d.ref, { customerName: '' }));

    expect(b.commits.map(c => c.length)).toEqual([TAMANHO_DO_LOTE, 5]);
  });

  // Página cheia e exata não prova que acabou: pode haver outra atrás.
  it('busca de novo quando a página vem exatamente cheia', async () => {
    const b = bancoFalso(criar(TAMANHO_DO_LOTE));

    const n = await porLote(b.db, b.consulta, (lote, d) =>
      lote.update(d.ref, { customerName: '' }),
    );

    expect(n).toBe(TAMANHO_DO_LOTE);
    expect(b.commits).toHaveLength(1);
  });

  it('não visita o mesmo documento duas vezes', async () => {
    const b = bancoFalso(criar(TAMANHO_DO_LOTE + 10));

    await porLote(b.db, b.consulta, (lote, d) => lote.update(d.ref, { customerName: '' }));

    const visitados = b.commits.flat();
    expect(new Set(visitados).size).toBe(visitados.length);
  });
});

describe('apagarTudo', () => {
  it('esvazia a coleção', async () => {
    const b = bancoFalso(criar(5));

    expect(await apagarTudo(b.db, b.consulta)).toBe(5);
    expect(b.estado.size).toBe(0);
  });

  it('esvazia mesmo passando de um lote', async () => {
    const b = bancoFalso(criar(TAMANHO_DO_LOTE + 1));

    expect(await apagarTudo(b.db, b.consulta)).toBe(TAMANHO_DO_LOTE + 1);
    expect(b.estado.size).toBe(0);
  });

  it('aceita coleção vazia', async () => {
    const b = bancoFalso([]);

    expect(await apagarTudo(b.db, b.consulta)).toBe(0);
  });
});

describe('teto de páginas', () => {
  // Laço sem limite numa Cloud Function gira até o timeout se a paginação
  // quebrar. O teto transforma defeito silencioso e caro em erro visível.
  it('levanta erro em vez de girar para sempre', async () => {
    const b = bancoFalso(criar(3));
    // Consulta que ignora o cursor: devolve sempre a mesma página cheia, que é
    // o sintoma exato de paginação quebrada.
    const presa = {
      startAfter: () => presa,
      limit: () => presa,
      get: async () => ({
        empty: false,
        size: TAMANHO_DO_LOTE,
        docs: Array.from({ length: TAMANHO_DO_LOTE }, (_, i) => ({
          id: `x${i}`,
          ref: { id: `x${i}` },
          get: () => 'Jorge',
        })),
      }),
    };

    // Ação neutra: o que está sob teste é o teto do laço, não o que ele faz.
    await expect(porLote(b.db, presa as never, () => {})).rejects.toBeInstanceOf(VarreduraSemFim);
  });

  it('não atrapalha varredura de tamanho normal', async () => {
    const b = bancoFalso(criar(TAMANHO_DO_LOTE * 3));

    await expect(
      porLote(b.db, b.consulta, (lote, d) => lote.update(d.ref, { customerName: '' })),
    ).resolves.toBe(TAMANHO_DO_LOTE * 3);
  });
});

// O limite de 500 escritas por lote é do Firestore, não nosso: nenhum teste
// com banco de mentira consegue senti-lo, e estourar derruba o commit inteiro
// em produção. A guarda fica aqui porque é o único lugar que percebe.
describe('limite do Firestore', () => {
  it('mantém o lote abaixo das 500 escritas que o Firestore aceita', () => {
    expect(TAMANHO_DO_LOTE).toBeLessThanOrEqual(500);
    expect(TAMANHO_DO_LOTE).toBeGreaterThan(0);
  });
});
