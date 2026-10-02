import { chaveDoDia, dentroDoLimite, diaUtc, extrairIp } from './limitePorIp';

const AGORA = Date.UTC(2026, 9, 2, 15, 0, 0);

describe('extrairIp', () => {
  // Atrás do balanceador o IP real vem no x-forwarded-for; req.ip daria sempre
  // o endereço do balanceador, e o teto viraria global.
  it('pega o primeiro IP da lista encaminhada', () => {
    expect(extrairIp({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' })).toBe('203.0.113.5');
  });

  it('aceita um IP sozinho', () => {
    expect(extrairIp({ 'x-forwarded-for': '203.0.113.5' })).toBe('203.0.113.5');
  });

  it('aceita o cabeçalho em forma de lista', () => {
    expect(extrairIp({ 'x-forwarded-for': ['203.0.113.5', '10.0.0.1'] })).toBe('203.0.113.5');
  });

  it('devolve nulo quando o cabeçalho não existe', () => {
    expect(extrairIp({})).toBeNull();
  });

  it('devolve nulo quando o cabeçalho vem vazio', () => {
    expect(extrairIp({ 'x-forwarded-for': '' })).toBeNull();
    expect(extrairIp({ 'x-forwarded-for': '   ' })).toBeNull();
  });
});

describe('chaveDoDia', () => {
  it('usa o mesmo documento para o mesmo IP no mesmo dia', () => {
    const manha = Date.UTC(2026, 9, 2, 1, 0, 0);
    const noite = Date.UTC(2026, 9, 2, 23, 0, 0);

    expect(chaveDoDia('203.0.113.5', manha)).toBe(chaveDoDia('203.0.113.5', noite));
  });

  it('troca de documento na virada do dia', () => {
    const hoje = Date.UTC(2026, 9, 2, 23, 59, 0);
    const amanha = Date.UTC(2026, 9, 3, 0, 1, 0);

    expect(chaveDoDia('203.0.113.5', hoje)).not.toBe(chaveDoDia('203.0.113.5', amanha));
  });

  it('separa IPs diferentes', () => {
    expect(chaveDoDia('203.0.113.5', AGORA)).not.toBe(chaveDoDia('203.0.113.6', AGORA));
  });

  // IP é dado pessoal e estes contadores ficam guardados. A chave não pode
  // conter o endereço em texto claro.
  it('não deixa o IP legível na chave', () => {
    expect(chaveDoDia('203.0.113.5', AGORA)).not.toContain('203.0.113.5');
    expect(chaveDoDia('2001:db8::1', AGORA)).not.toContain('2001');
  });

  // Hash com o dia dentro: o mesmo IP muda de identificador a cada dia, então
  // os contadores não permitem seguir alguém ao longo do tempo.
  it('gera identificadores diferentes para o mesmo IP em dias diferentes', () => {
    const a = chaveDoDia('203.0.113.5', AGORA).split('_')[1];
    const b = chaveDoDia('203.0.113.5', AGORA + 86400000).split('_')[1];

    expect(a).not.toBe(b);
  });

  it('aceita IPv6 sem quebrar o id do documento', () => {
    expect(chaveDoDia('2001:db8::1', AGORA)).not.toContain(':');
    expect(chaveDoDia('2001:db8::1', AGORA)).not.toContain('/');
  });
});

describe('diaUtc', () => {
  it('formata com dois dígitos', () => {
    expect(diaUtc(Date.UTC(2026, 0, 5))).toBe('2026-01-05');
  });
});

/** Firestore de mentira: só o suficiente para a transação do contador. */
function bancoFalso(inicial: Record<string, { chamadas: number }> = {}, falhar = false) {
  const dados = { ...inicial };
  return {
    dados,
    doc: (caminho: string) => ({ caminho }),
    runTransaction: async (fn: (tx: unknown) => Promise<number>) => {
      if (falhar) throw new Error('indisponivel');
      const tx = {
        get: async (ref: { caminho: string }) => ({
          data: () => dados[ref.caminho],
        }),
        set: (ref: { caminho: string }, valor: { chamadas: number }) => {
          dados[ref.caminho] = { chamadas: valor.chamadas };
        },
      };
      return fn(tx);
    },
  } as never;
}

describe('dentroDoLimite', () => {
  it('permite a primeira chamada do dia', async () => {
    const db = bancoFalso();

    await expect(dentroDoLimite(db, '203.0.113.5', AGORA, 3)).resolves.toEqual({ permitido: true });
  });

  it('conta cada chamada', async () => {
    const db = bancoFalso();
    const chave = `geocodeQuotas/${chaveDoDia('203.0.113.5', AGORA)}`;

    await dentroDoLimite(db, '203.0.113.5', AGORA, 3);
    await dentroDoLimite(db, '203.0.113.5', AGORA, 3);

    expect((db as unknown as { dados: Record<string, { chamadas: number }> }).dados[chave]).toEqual(
      {
        chamadas: 2,
      },
    );
  });

  it('permite até o teto e barra depois dele', async () => {
    const db = bancoFalso();

    await expect(dentroDoLimite(db, '203.0.113.5', AGORA, 2)).resolves.toEqual({ permitido: true });
    await expect(dentroDoLimite(db, '203.0.113.5', AGORA, 2)).resolves.toEqual({ permitido: true });
    await expect(dentroDoLimite(db, '203.0.113.5', AGORA, 2)).resolves.toEqual({
      permitido: false,
      status: 429,
      erro: 'Muitas consultas de endereço hoje.',
    });
  });

  it('não deixa o contador crescer depois de barrado', async () => {
    const db = bancoFalso();
    const chave = `geocodeQuotas/${chaveDoDia('203.0.113.5', AGORA)}`;

    for (let i = 0; i < 5; i++) await dentroDoLimite(db, '203.0.113.5', AGORA, 2);

    expect((db as unknown as { dados: Record<string, { chamadas: number }> }).dados[chave]).toEqual(
      {
        chamadas: 2,
      },
    );
  });

  it('conta cada IP separadamente', async () => {
    const db = bancoFalso();

    await dentroDoLimite(db, '203.0.113.5', AGORA, 1);

    await expect(dentroDoLimite(db, '203.0.113.6', AGORA, 1)).resolves.toEqual({ permitido: true });
  });

  it('zera na virada do dia', async () => {
    const db = bancoFalso();

    await dentroDoLimite(db, '203.0.113.5', AGORA, 1);

    await expect(dentroDoLimite(db, '203.0.113.5', AGORA + 86400000, 1)).resolves.toEqual({
      permitido: true,
    });
  });

  it('permite quando não há IP para contar', async () => {
    const db = bancoFalso();

    await expect(dentroDoLimite(db, null, AGORA, 1)).resolves.toEqual({ permitido: true });
  });

  // Derrubar o cadastro porque o contador teve um soluço troca um problema de
  // custo por um de receita.
  it('permite quando o contador falha', async () => {
    const db = bancoFalso({}, true);

    await expect(dentroDoLimite(db, '203.0.113.5', AGORA, 1)).resolves.toEqual({ permitido: true });
  });
});
