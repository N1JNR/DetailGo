const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockDoc = jest.fn((..._args: unknown[]) => ({}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  serverTimestamp: jest.fn(() => 'ts'),
}));

import {
  ensureShopSettings,
  getShopSettings,
  updateShopSettings,
  ShopSettingsError,
  SHOP_SETTINGS_DEFAULTS,
  MAX_MIN_NOTICE_MIN,
} from './shopSettings.service';

function snapWith(data: Record<string, unknown>) {
  return { exists: true, data: () => data };
}

const SEM_DOCUMENTO = { exists: false, data: () => undefined };

// Documento de uma loja criada antes de slotStepMin/minNoticeMin existirem.
const legacyShop = {
  openHour: 8,
  closeHour: 18,
  parallelCapacity: 2,
  workingDays: ['seg', 'ter', 'qua', 'qui', 'sex'],
};

/** Loja completa e válida, para isolar um campo por vez nos testes de borda. */
const lojaValida = { ...SHOP_SETTINGS_DEFAULTS };

beforeEach(() => {
  mockGetDoc.mockReset();
  mockSetDoc.mockReset();
  mockDoc.mockClear();
  mockSetDoc.mockResolvedValue(undefined);
});

describe('ensureShopSettings', () => {
  it('preenche os padrões novos em loja antiga', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith(legacyShop));

    const { settings } = await ensureShopSettings('shop-1');

    expect(settings.slotStepMin).toBe(30);
    expect(settings.minNoticeMin).toBe(15);
  });

  // A gravação é o que cura o documento legado. Sem ela, cada leitura remescla
  // em memória e o documento fica torto para sempre — e o teste que só olha o
  // valor devolvido passa igual.
  it('grava os padrões mesclados de volta na loja antiga', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith(legacyShop));

    await ensureShopSettings('shop-1');

    expect(mockSetDoc).toHaveBeenCalledWith(
      {},
      { ...SHOP_SETTINGS_DEFAULTS, updatedAt: 'ts' },
      { merge: true },
    );
  });

  it('sem permissão de escrita, ainda devolve as settings', async () => {
    // O cliente lê as settings para montar os horários, mas as firestore.rules
    // só deixam o dono escrever. A gravação dos padrões falha e NÃO pode
    // derrubar a leitura — senão o cliente não consegue ver horário nenhum.
    mockGetDoc.mockResolvedValueOnce(snapWith(legacyShop));
    mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'));

    const { settings } = await ensureShopSettings('shop-1');

    expect(settings.slotStepMin).toBe(30);
    expect(settings.openHour).toBe(8);
  });

  it('descarta valores inválidos e usa o padrão', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith({ ...legacyShop, slotStepMin: 7, minNoticeMin: -5 }));

    const { settings } = await ensureShopSettings('shop-1');

    expect(settings.slotStepMin).toBe(30);
    expect(settings.minNoticeMin).toBe(15);
  });

  it('mantém valores válidos já configurados', async () => {
    mockGetDoc.mockResolvedValueOnce(
      snapWith({ ...legacyShop, slotStepMin: 15, minNoticeMin: 60 }),
    );

    const { settings } = await ensureShopSettings('shop-1');

    expect(settings.slotStepMin).toBe(15);
    expect(settings.minNoticeMin).toBe(60);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('aponta para shops/{shopId}/settings/config', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith(lojaValida));

    await ensureShopSettings('shop-7');

    expect(mockDoc).toHaveBeenCalledWith({}, 'shops', 'shop-7', 'settings', 'config');
  });

  describe('loja sem documento de settings', () => {
    it('cria com os padrões e avisa que criou', async () => {
      mockGetDoc.mockResolvedValueOnce(SEM_DOCUMENTO);

      const { created, settings } = await ensureShopSettings('shop-1');

      expect(created).toBe(true);
      expect(settings).toEqual(SHOP_SETTINGS_DEFAULTS);
    });

    it('grava os padrões com as duas datas', async () => {
      mockGetDoc.mockResolvedValueOnce(SEM_DOCUMENTO);

      await ensureShopSettings('shop-1');

      expect(mockSetDoc).toHaveBeenCalledWith(
        {},
        { ...SHOP_SETTINGS_DEFAULTS, createdAt: 'ts', updatedAt: 'ts' },
      );
    });
  });

  it('avisa que não criou quando o documento já existia', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith(lojaValida));

    const { created } = await ensureShopSettings('shop-1');

    expect(created).toBe(false);
  });

  // Falha de leitura é diferente de falha de gravação: sem os dados não dá para
  // montar horário nenhum, então aqui tem que estourar em vez de seguir com
  // valor inventado.
  it('estoura quando a leitura falha', async () => {
    mockGetDoc.mockRejectedValueOnce(new Error('offline'));

    await expect(ensureShopSettings('shop-1')).rejects.toBeInstanceOf(ShopSettingsError);
  });

  it('estoura também quando a criação do documento falha', async () => {
    mockGetDoc.mockResolvedValueOnce(SEM_DOCUMENTO);
    mockSetDoc.mockRejectedValueOnce(new Error('offline'));

    await expect(ensureShopSettings('shop-1')).rejects.toBeInstanceOf(ShopSettingsError);
  });
});

// Estes limites decidem que horário o cliente enxerga. Errar aqui faz a agenda
// aceitar agendamento fora do expediente — o estrago chega como estética
// fechada com carro marcado na porta.
describe('validação dos limites', () => {
  async function comDocumento(data: Record<string, unknown>) {
    mockGetDoc.mockResolvedValueOnce(snapWith({ ...lojaValida, ...data }));
    const { settings } = await ensureShopSettings('shop-1');
    return settings;
  }

  describe('hora de abrir e fechar', () => {
    it.each([
      ['meia-noite', 0],
      ['última hora do dia', 23],
    ])('aceita %s', async (_caso, hora) => {
      expect((await comDocumento({ openHour: hora })).openHour).toBe(hora);
    });

    it.each([
      ['24, que não existe no relógio', 24],
      ['hora negativa', -1],
      ['nulo', null],
    ])('recusa %s e usa o padrão', async (_caso, hora) => {
      expect((await comDocumento({ openHour: hora })).openHour).toBe(
        SHOP_SETTINGS_DEFAULTS.openHour,
      );
    });

    it('valida a hora de fechar pela mesma régua', async () => {
      expect((await comDocumento({ closeHour: 24 })).closeHour).toBe(
        SHOP_SETTINGS_DEFAULTS.closeHour,
      );
      expect((await comDocumento({ closeHour: 23 })).closeHour).toBe(23);
    });
  });

  describe('capacidade em paralelo', () => {
    it.each([
      ['um carro', 1],
      ['dez carros', 10],
    ])('aceita %s', async (_caso, n) => {
      expect((await comDocumento({ parallelCapacity: n })).parallelCapacity).toBe(n);
    });

    it.each([
      ['zero', 0],
      ['negativa', -1],
      ['acima de dez', 11],
    ])('recusa capacidade %s e usa o padrão', async (_caso, n) => {
      expect((await comDocumento({ parallelCapacity: n })).parallelCapacity).toBe(
        SHOP_SETTINGS_DEFAULTS.parallelCapacity,
      );
    });
  });

  describe('intervalo entre horários', () => {
    it.each([15, 30, 60])('aceita %i minutos', async step => {
      expect((await comDocumento({ slotStepMin: step })).slotStepMin).toBe(step);
    });

    it.each([
      ['fora da lista', 20],
      ['zero', 0],
      ['negativo', -30],
    ])('recusa intervalo %s', async (_caso, step) => {
      expect((await comDocumento({ slotStepMin: step })).slotStepMin).toBe(
        SHOP_SETTINGS_DEFAULTS.slotStepMin,
      );
    });
  });

  describe('antecedência mínima', () => {
    it('aceita zero (agendar para agora)', async () => {
      expect((await comDocumento({ minNoticeMin: 0 })).minNoticeMin).toBe(0);
    });

    it('aceita o teto de quatro horas', async () => {
      expect((await comDocumento({ minNoticeMin: MAX_MIN_NOTICE_MIN })).minNoticeMin).toBe(
        MAX_MIN_NOTICE_MIN,
      );
    });

    it('recusa um minuto acima do teto', async () => {
      expect((await comDocumento({ minNoticeMin: MAX_MIN_NOTICE_MIN + 1 })).minNoticeMin).toBe(
        SHOP_SETTINGS_DEFAULTS.minNoticeMin,
      );
    });

    it('recusa antecedência negativa', async () => {
      expect((await comDocumento({ minNoticeMin: -1 })).minNoticeMin).toBe(
        SHOP_SETTINGS_DEFAULTS.minNoticeMin,
      );
    });
  });

  describe('dias de trabalho', () => {
    it('mantém os dias válidos', async () => {
      expect((await comDocumento({ workingDays: ['sab', 'dom'] })).workingDays).toEqual([
        'sab',
        'dom',
      ]);
    });

    it('descarta os dias que não existem e mantém o resto', async () => {
      expect((await comDocumento({ workingDays: ['seg', 'funfday', 'sex'] })).workingDays).toEqual([
        'seg',
        'sex',
      ]);
    });

    it.each([
      ['lista vazia', []],
      ['não é lista', 'seg,ter'],
      ['nulo', null],
    ])('cai no padrão quando vem %s', async (_caso, dias) => {
      expect((await comDocumento({ workingDays: dias })).workingDays).toEqual(
        SHOP_SETTINGS_DEFAULTS.workingDays,
      );
    });

    // Lista só com lixo esvazia no filtro. Sem cair no padrão, a estética passa
    // a trabalhar zero dias e some do agendamento sem ninguém perceber — o
    // mesmo efeito de mandar lista vazia, que já cai no padrão.
    it('cai no padrão quando sobra nada depois de filtrar', async () => {
      expect((await comDocumento({ workingDays: ['funfday', 'caturday'] })).workingDays).toEqual(
        SHOP_SETTINGS_DEFAULTS.workingDays,
      );
    });
  });
});

describe('getShopSettings', () => {
  it('devolve só as settings', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith({ ...lojaValida, openHour: 9 }));

    await expect(getShopSettings('shop-1')).resolves.toEqual({ ...lojaValida, openHour: 9 });
  });

  it('propaga a falha de leitura', async () => {
    mockGetDoc.mockRejectedValueOnce(new Error('offline'));

    await expect(getShopSettings('shop-1')).rejects.toBeInstanceOf(ShopSettingsError);
  });
});

describe('updateShopSettings', () => {
  it('muda só o que foi pedido e mantém o resto', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith(lojaValida));

    const settings = await updateShopSettings('shop-1', { openHour: 7 });

    expect(settings).toEqual({ ...lojaValida, openHour: 7 });
  });

  it('grava o resultado mesclado com a data de atualização', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith(lojaValida));

    await updateShopSettings('shop-1', { closeHour: 20 });

    expect(mockSetDoc).toHaveBeenLastCalledWith(
      {},
      { ...lojaValida, closeHour: 20, updatedAt: 'ts' },
      { merge: true },
    );
  });

  // Valor inválido vindo da tela não pode entrar no banco: a agenda inteira sai
  // do que foi gravado aqui.
  it('recusa valor inválido na atualização e mantém o atual', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith({ ...lojaValida, openHour: 9 }));

    const settings = await updateShopSettings('shop-1', { openHour: 99 });

    expect(settings.openHour).toBe(SHOP_SETTINGS_DEFAULTS.openHour);
  });

  it('estoura quando a gravação falha', async () => {
    mockGetDoc.mockResolvedValueOnce(snapWith(lojaValida));
    mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(updateShopSettings('shop-1', { openHour: 7 })).rejects.toThrow();
  });
});
