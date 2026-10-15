import { lerAssinatura, shopIdValido } from './shopBilling';
import { autorizarDonoDoShop } from './shopOwnerGuard';

describe('shopIdValido', () => {
  it('aceita o formato que o Firestore gera', () => {
    expect(shopIdValido('zX9kQp2LmN4rT8vB1cD3')).toBe(true);
    expect(shopIdValido('shop-1')).toBe(true);
    expect(shopIdValido('shop_1')).toBe(true);
  });

  // `db.doc('shops/' + shopId)` com barra aponta para OUTRO documento:
  // `a/settings/b` resolve para `shops/a/settings/b`, caminho de documento
  // válido e dentro de uma subcoleção que o dono escreve. Era por aí que dava
  // para forjar um documento com o próprio ownerId e o id de assinatura alheio.
  it('recusa qualquer coisa com barra', () => {
    expect(shopIdValido('shop-1/settings/config')).toBe(false);
    expect(shopIdValido('shop-1/')).toBe(false);
    expect(shopIdValido('/shop-1')).toBe(false);
    expect(shopIdValido('a/b')).toBe(false);
  });

  it('recusa caminho relativo', () => {
    expect(shopIdValido('..')).toBe(false);
    expect(shopIdValido('.')).toBe(false);
    expect(shopIdValido('../users/vitima')).toBe(false);
  });

  it('recusa vazio e espaços', () => {
    expect(shopIdValido('')).toBe(false);
    expect(shopIdValido('   ')).toBe(false);
    expect(shopIdValido('shop 1')).toBe(false);
  });

  it('recusa o que não é string', () => {
    expect(shopIdValido(undefined)).toBe(false);
    expect(shopIdValido(null)).toBe(false);
    expect(shopIdValido(42)).toBe(false);
    expect(shopIdValido({ toString: () => 'shop-1' })).toBe(false);
    expect(shopIdValido(['shop-1'])).toBe(false);
  });

  it('recusa id absurdamente longo', () => {
    expect(shopIdValido('a'.repeat(128))).toBe(true);
    expect(shopIdValido('a'.repeat(129))).toBe(false);
  });
});

/** Firestore de mentira: só o `doc(caminho).get()` que estes testes usam. */
function bancoFalso(documentos: Record<string, Record<string, unknown> | undefined>) {
  const lidos: string[] = [];
  const db = {
    lidos,
    doc: (caminho: string) => ({
      get: async () => {
        lidos.push(caminho);
        const dados = documentos[caminho];
        return { exists: dados !== undefined, data: () => dados };
      },
    }),
  };
  return db as unknown as Parameters<typeof lerAssinatura>[0] & { lidos: string[] };
}

describe('lerAssinatura', () => {
  it('lê o id de shopBilling, não do documento da loja', async () => {
    const db = bancoFalso({
      'shopBilling/shop-1': { asaasSubscriptionId: 'sub_123' },
      'shops/shop-1': { asaasSubscriptionId: 'sub_da_vitima' },
    });

    expect(await lerAssinatura(db, 'shop-1')).toBe('sub_123');
    expect(db.lidos).toEqual(['shopBilling/shop-1']);
  });

  it('devolve nulo quando a estética nunca pagou', async () => {
    const db = bancoFalso({});

    expect(await lerAssinatura(db, 'shop-1')).toBeNull();
  });

  // Pix é avulso e não cria assinatura: o documento existe com o último
  // pagamento, mas sem recorrência para cancelar.
  it('devolve nulo quando o documento existe sem assinatura', async () => {
    const db = bancoFalso({ 'shopBilling/shop-1': { lastPaymentId: 'pay_1' } });

    expect(await lerAssinatura(db, 'shop-1')).toBeNull();
  });

  it('devolve nulo quando o campo está vazio ou não é texto', async () => {
    expect(
      await lerAssinatura(bancoFalso({ 'shopBilling/s': { asaasSubscriptionId: '' } }), 's'),
    ).toBeNull();
    expect(
      await lerAssinatura(bancoFalso({ 'shopBilling/s': { asaasSubscriptionId: 42 } }), 's'),
    ).toBeNull();
    expect(
      await lerAssinatura(bancoFalso({ 'shopBilling/s': { asaasSubscriptionId: null } }), 's'),
    ).toBeNull();
  });
});

describe('autorizarDonoDoShop', () => {
  const VERIFICADO = { uid: 'dono-1' };
  let verificarToken: jest.Mock;

  beforeEach(() => {
    verificarToken = jest.fn().mockResolvedValue(VERIFICADO);
    jest.spyOn(require('firebase-admin'), 'auth').mockReturnValue({
      verifyIdToken: verificarToken,
    } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  const comToken = (body: unknown) => ({
    headers: { authorization: 'Bearer token-valido' },
    body,
  });

  it('autoriza o dono da loja', async () => {
    const db = bancoFalso({ 'shops/shop-1': { ownerId: 'dono-1', name: 'Estética' } });

    const r = await autorizarDonoDoShop(comToken({ shopId: 'shop-1' }), db);

    expect(r).toMatchObject({ ok: true, shopId: 'shop-1' });
  });

  it('recusa quem não é dono', async () => {
    const db = bancoFalso({ 'shops/shop-1': { ownerId: 'outro' } });

    const r = await autorizarDonoDoShop(comToken({ shopId: 'shop-1' }), db);

    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it('recusa sem cabeçalho de autorização', async () => {
    const r = await autorizarDonoDoShop(
      { headers: {}, body: { shopId: 'shop-1' } },
      bancoFalso({}),
    );

    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(verificarToken).not.toHaveBeenCalled();
  });

  // Cabeçalho vazio é recusado por qualquer implementação; o que prende o
  // contrato é o cabeçalho PRESENTE e sem o prefixo, que não pode virar token.
  it.each([
    ['sem o prefixo Bearer', 'token-cru'],
    ['com prefixo errado', 'Basic token-cru'],
    ['só com a palavra Bearer', 'Bearer'],
  ])('recusa cabeçalho %s', async (_caso, authorization) => {
    const r = await autorizarDonoDoShop(
      { headers: { authorization }, body: { shopId: 'shop-1' } },
      bancoFalso({}),
    );

    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(verificarToken).not.toHaveBeenCalled();
  });

  it('recusa loja inexistente', async () => {
    const r = await autorizarDonoDoShop(comToken({ shopId: 'shop-1' }), bancoFalso({}));

    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  // A trava de formato tem que agir ANTES de tocar o banco, senão o caminho
  // forjado já foi montado.
  it('recusa shopId com barra sem nem consultar o banco', async () => {
    const db = bancoFalso({
      'shops/shop-1/settings/forjado': { ownerId: 'dono-1', asaasSubscriptionId: 'sub_da_vitima' },
    });

    const r = await autorizarDonoDoShop(comToken({ shopId: 'shop-1/settings/forjado' }), db);

    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(db.lidos).toEqual([]);
  });

  it('recusa shopId que não é texto', async () => {
    const r = await autorizarDonoDoShop(
      comToken({ shopId: { toString: () => 'shop-1' } }),
      bancoFalso({}),
    );

    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('recusa corpo sem shopId', async () => {
    const r = await autorizarDonoDoShop(comToken({}), bancoFalso({}));

    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});
