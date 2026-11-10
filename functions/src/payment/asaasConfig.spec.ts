import { resolveAsaasConfig } from './asaasConfig';
import { buildCheckoutRequest, toAsaasDate } from './asaasCheckoutRequest';

const CHAVE_PRODUCAO = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2';
const CHAVE_SANDBOX = '$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2';

/** Piso que o Asaas impõe a qualquer cobrança. Abaixo disso ele recusa com 400. */
const MINIMO_ASAAS = 5.0;

describe('resolveAsaasConfig', () => {
  it('chave de producao cobra o valor cheio e aponta para a API real', () => {
    const config = resolveAsaasConfig(CHAVE_PRODUCAO);

    expect(config.planValue).toBe(89.0);
    expect(config.baseUrl).toBe('https://api.asaas.com/v3');
  });

  it('chave de sandbox aponta para a API de teste', () => {
    expect(resolveAsaasConfig(CHAVE_SANDBOX).baseUrl).toContain('sandbox');
  });

  // Foi assim que descobrimos o piso: o checkout de R$ 0,01 voltou 400.
  it.each([CHAVE_PRODUCAO, CHAVE_SANDBOX, 'lixo', undefined])(
    'nunca cobra abaixo do minimo do Asaas (%s)',
    chave => {
      expect(resolveAsaasConfig(chave).planValue).toBeGreaterThanOrEqual(MINIMO_ASAAS);
    },
  );

  // O estado perigoso e producao cobrando barato. Chave irreconhecivel cai em
  // sandbox — nunca cobra os R$ 89 por engano.
  it.each([undefined, '', 'chave-invalida', 'aact_prod_sem_cifrao'])(
    'trata %s como sandbox',
    chave => {
      expect(resolveAsaasConfig(chave).planValue).toBeLessThan(89.0);
    },
  );

  it('a URL e o valor andam sempre juntos', () => {
    for (const chave of [CHAVE_PRODUCAO, CHAVE_SANDBOX, 'lixo', undefined]) {
      const { baseUrl, planValue } = resolveAsaasConfig(chave);
      const ehProducao = !baseUrl.includes('sandbox');

      expect(planValue === 89.0).toBe(ehProducao);
    }
  });
});

describe('buildCheckoutRequest', () => {
  const base = {
    shopId: 'shop_1',
    shopName: 'Estetica A',
    config: resolveAsaasConfig(CHAVE_PRODUCAO),
    returnUrl: 'https://detailgo.com.br/assinatura',
    now: new Date('2026-08-27T12:00:00Z'),
  };

  const cartao = () => buildCheckoutRequest({ ...base, metodo: 'card' as const });
  const pix = () => buildCheckoutRequest({ ...base, metodo: 'pix' as const });

  // Regras do Asaas, descobertas na marra: RECURRENT so aceita CREDIT_CARD, e
  // PIX exige DETACHED. Pedir Pix recorrente volta 400.
  describe('cartao', () => {
    it('e recorrente e mensal', () => {
      const req = cartao();

      expect(req.billingTypes).toEqual(['CREDIT_CARD']);
      expect(req.chargeTypes).toEqual(['RECURRENT']);
      expect(req.subscription).toEqual({ cycle: 'MONTHLY', nextDueDate: '2026-08-27' });
    });

    it('nao oferece Pix junto', () => {
      expect(cartao().billingTypes).not.toContain('PIX');
    });
  });

  describe('pix', () => {
    it('e avulso, sem assinatura', () => {
      const req = pix();

      expect(req.billingTypes).toEqual(['PIX']);
      expect(req.chargeTypes).toEqual(['DETACHED']);
      expect(req.subscription).toBeUndefined();
    });

    it('nao oferece cartao junto', () => {
      expect(pix().billingTypes).not.toContain('CREDIT_CARD');
    });
  });

  // E por este campo que o webhook descobre quem pagou.
  it.each(['card', 'pix'] as const)('carrega o shopId no externalReference (%s)', metodo => {
    expect(buildCheckoutRequest({ ...base, metodo }).externalReference).toBe('shop_1');
  });

  it.each(['card', 'pix'] as const)('usa o valor do ambiente (%s)', metodo => {
    const sandbox = buildCheckoutRequest({
      ...base,
      metodo,
      config: resolveAsaasConfig(CHAVE_SANDBOX),
    });

    expect(buildCheckoutRequest({ ...base, metodo }).items[0].value).toBe(89.0);
    expect(sandbox.items[0].value).toBe(5.0);
  });

  it('o nome do item cabe no limite de 30 caracteres do Asaas', () => {
    expect(cartao().items[0].name.length).toBeLessThanOrEqual(30);
  });
});

describe('toAsaasDate', () => {
  it('formata como AAAA-MM-DD', () => {
    expect(toAsaasDate(new Date('2026-01-05T23:30:00Z'))).toBe('2026-01-05');
  });
});
