/**
 * Testes das firestore.rules contra o emulador do Firestore.
 *
 * Protege o modelo multi-tenant e a regra de cancelamento:
 *  - um cliente/dono não escreve em shop de outro estabelecimento;
 *  - o cliente só cancela o próprio agendamento e apenas antes do horário.
 *
 * Roda via `npm run test:rules` (firebase emulators:exec).
 */
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, Timestamp } = require('firebase/firestore');

const OWNER_A = 'owner_a';
const OWNER_B = 'owner_b';
const CUSTOMER_1 = 'customer_1';
const CUSTOMER_2 = 'customer_2';
const SHOP_A = 'shop_a';
const SHOP_B = 'shop_b';

const NOW = Date.now();
const FUTURE = NOW + 60 * 60 * 1000; // horário ainda por vir (+1h)
const PAST = NOW - 60 * 60 * 1000; // horário já passou (-1h)

let testEnv;

const authed = uid => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'detailgo-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Semeia o estado inicial ignorando as regras (contexto admin).
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    // SHOP_A nasce em trial — é desse estado que parte a tentativa de se
    // promover a pago sozinho, que os testes de cobrança cobrem.
    //
    // O valor importa: `affectedKeys()` só lista campo cujo valor MUDOU, então
    // semear já como 'active' faria a gravação de 'active' virar escrita sem
    // efeito, com diff vazio, e a regra passaria sem que isso signifique nada.
    await setDoc(doc(db, 'shops', SHOP_A), {
      ownerId: OWNER_A,
      name: 'Estetica A',
      subscriptionStatus: 'trial',
      trialEndsAt: Timestamp.fromMillis(NOW + 3 * 24 * 60 * 60 * 1000),
      activeUntil: null,
    });
    await setDoc(doc(db, 'shops', SHOP_B), { ownerId: OWNER_B, name: 'Estetica B' });
    // Vínculo com o Asaas: fora do alcance do cliente, escrito só pelo backend.
    await setDoc(doc(db, 'shopBilling', SHOP_A), {
      shopId: SHOP_A,
      asaasSubscriptionId: 'sub_da_estetica_a',
      lastPaymentId: 'pay_1',
    });
    await setDoc(doc(db, 'shops', SHOP_A, 'settings', 'config'), { openHour: 8, closeHour: 18 });
    await setDoc(doc(db, 'shops', SHOP_A, 'services', 'svc1'), { label: 'Lavagem', price: 50 });
    await setDoc(doc(db, 'shops', SHOP_A, 'appointments', 'appt_future'), {
      customerUid: CUSTOMER_1,
      status: 'scheduled',
      startAtMs: FUTURE,
    });
    await setDoc(doc(db, 'shops', SHOP_A, 'appointments', 'appt_past'), {
      customerUid: CUSTOMER_1,
      status: 'scheduled',
      startAtMs: PAST,
    });
    await setDoc(doc(db, 'shops', SHOP_A, 'notifications', 'n1'), { title: 'Novo agendamento' });
    // Slot já existente (sem PII) para os testes de leitura.
    await setDoc(doc(db, 'shops', SHOP_A, 'slots', 'slot_read'), {
      startAtMs: FUTURE,
      endAtMs: FUTURE + 30 * 60 * 1000,
      dayKey: 'seed',
      shopId: SHOP_A,
    });
    // Cobrança da estética A, escrita pelas Cloud Functions (Admin SDK).
    await setDoc(doc(db, 'payments', 'pay_a'), {
      paymentId: 'pay_a',
      shopId: SHOP_A,
      shopName: 'Estetica A',
      amount: 8900,
      status: 'pending',
    });
  });
});

/** Documento de shop recém-criado, como o cadastro do app monta. */
const novoShop = (ownerId, extra = {}) => ({
  ownerId,
  name: 'X',
  subscriptionStatus: 'trial',
  activeUntil: null,
  trialEndsAt: Timestamp.fromMillis(NOW + 7 * 24 * 60 * 60 * 1000),
  ...extra,
});

describe('shops', () => {
  // Era `allow read: if true`, e regra do Firestore não esconde campo: o
  // documento inteiro ia para a internet aberta. O mapa fica atrás do login,
  // então exigir sessão não custa nada e fecha a exposição.
  test('deslogado não lê shop', async () => {
    await assertFails(getDoc(doc(anon(), 'shops', SHOP_A)));
  });

  test('logado lê shop (o mapa precisa)', async () => {
    await assertSucceeds(getDoc(doc(authed(CUSTOMER_1), 'shops', SHOP_A)));
  });

  test('cria shop só com ownerId == próprio uid', async () => {
    await assertSucceeds(
      setDoc(doc(authed(CUSTOMER_1), 'shops', 'novo_shop'), novoShop(CUSTOMER_1)),
    );
  });

  test('não cria shop no nome de outro', async () => {
    await assertFails(setDoc(doc(authed(CUSTOMER_1), 'shops', 'novo_shop'), novoShop(OWNER_B)));
  });

  test('dono não edita shop de outro dono', async () => {
    await assertFails(updateDoc(doc(authed(OWNER_B), 'shops', SHOP_A), { name: 'hack' }));
  });

  test('dono edita os campos normais do próprio shop', async () => {
    await assertSucceeds(updateDoc(doc(authed(OWNER_A), 'shops', SHOP_A), { name: 'A novo' }));
  });
});

// O app decide o acesso lendo subscriptionStatus/activeUntil do documento da
// loja, e a Cloud Function usava o asaasSubscriptionId de dentro dele. Com os
// campos graváveis pelo dono, dava para liberar o plano de graça e para
// cancelar a assinatura de OUTRA estética.
describe('shops — campos de cobrança fora do alcance do dono', () => {
  test.each([
    ['subscriptionStatus', { subscriptionStatus: 'active' }],
    ['activeUntil', { activeUntil: Timestamp.fromMillis(NOW + 365 * 24 * 60 * 60 * 1000) }],
    ['trialEndsAt', { trialEndsAt: Timestamp.fromMillis(NOW + 365 * 24 * 60 * 60 * 1000) }],
    ['asaasSubscriptionId', { asaasSubscriptionId: 'sub_de_outra_estetica' }],
    ['lastPaymentId', { lastPaymentId: 'pay_forjado' }],
    ['lastPaymentAt', { lastPaymentAt: Timestamp.fromMillis(NOW) }],
    ['ownerId', { ownerId: CUSTOMER_2 }],
  ])('dono não altera %s no próprio shop', async (_campo, patch) => {
    await assertFails(updateDoc(doc(authed(OWNER_A), 'shops', SHOP_A), patch));
  });

  test('dono não mistura campo normal com campo de cobrança', async () => {
    await assertFails(
      updateDoc(doc(authed(OWNER_A), 'shops', SHOP_A), {
        name: 'A novo',
        subscriptionStatus: 'active',
      }),
    );
  });

  test('não nasce shop já ativo', async () => {
    await assertFails(
      setDoc(
        doc(authed(CUSTOMER_1), 'shops', 'novo_shop'),
        novoShop(CUSTOMER_1, {
          subscriptionStatus: 'active',
          activeUntil: Timestamp.fromMillis(NOW + 365 * 24 * 60 * 60 * 1000),
        }),
      ),
    );
  });

  // O trial é escrito pelo cliente no cadastro, então não dá para proibir o
  // campo — só limitar o valor. Sem o teto, bastava nascer com trial em 2099.
  test('não nasce com trial além da janela', async () => {
    await assertFails(
      setDoc(
        doc(authed(CUSTOMER_1), 'shops', 'novo_shop'),
        novoShop(CUSTOMER_1, {
          trialEndsAt: Timestamp.fromMillis(NOW + 365 * 24 * 60 * 60 * 1000),
        }),
      ),
    );
  });

  test('não nasce com trial no passado', async () => {
    await assertFails(
      setDoc(
        doc(authed(CUSTOMER_1), 'shops', 'novo_shop'),
        novoShop(CUSTOMER_1, { trialEndsAt: Timestamp.fromMillis(PAST) }),
      ),
    );
  });

  test('não nasce com vínculo de assinatura', async () => {
    await assertFails(
      setDoc(
        doc(authed(CUSTOMER_1), 'shops', 'novo_shop'),
        novoShop(CUSTOMER_1, { asaasSubscriptionId: 'sub_de_outra_estetica' }),
      ),
    );
  });
});

describe('shopBilling (vínculo com o Asaas)', () => {
  test.each([
    ['o próprio dono', OWNER_A],
    ['outro dono', OWNER_B],
    ['um cliente', CUSTOMER_1],
  ])('%s não lê o vínculo', async (_quem, uid) => {
    await assertFails(getDoc(doc(authed(uid), 'shopBilling', SHOP_A)));
  });

  test('deslogado não lê o vínculo', async () => {
    await assertFails(getDoc(doc(anon(), 'shopBilling', SHOP_A)));
  });

  test('ninguém escreve o vínculo', async () => {
    await assertFails(
      setDoc(doc(authed(OWNER_A), 'shopBilling', SHOP_A), { asaasSubscriptionId: 'forjado' }),
    );
    await assertFails(
      setDoc(doc(authed(OWNER_B), 'shopBilling', SHOP_A), { asaasSubscriptionId: 'forjado' }),
    );
  });

  test('dono não cria vínculo para a própria loja', async () => {
    await assertFails(
      setDoc(doc(authed(OWNER_B), 'shopBilling', SHOP_B), { asaasSubscriptionId: 'sub_qualquer' }),
    );
  });
});

describe('settings e services (escrita só do dono)', () => {
  test('cliente não escreve services de um shop', async () => {
    await assertFails(
      setDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'services', 'svc2'), { price: 1 }),
    );
  });

  test('dono de outro shop não escreve services do shop A', async () => {
    await assertFails(
      setDoc(doc(authed(OWNER_B), 'shops', SHOP_A, 'services', 'svc2'), { price: 1 }),
    );
  });

  test('dono escreve os próprios services', async () => {
    await assertSucceeds(
      setDoc(doc(authed(OWNER_A), 'shops', SHOP_A, 'services', 'svc2'), { price: 80 }),
    );
  });

  test('cliente não altera settings do shop', async () => {
    await assertFails(
      updateDoc(doc(authed(CUSTOMER_1), 'shops', SHOP_A, 'settings', 'config'), { openHour: 0 }),
    );
  });

  test('dono altera os próprios settings', async () => {
    await assertSucceeds(
      updateDoc(doc(authed(OWNER_A), 'shops', SHOP_A, 'settings', 'config'), { openHour: 9 }),
    );
  });

  test('cliente lê services e settings (para agendar)', async () => {
    await assertSucceeds(getDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'services', 'svc1')));
    await assertSucceeds(getDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'settings', 'config')));
  });
});

describe('agendamentos — criação', () => {
  test('cliente cria o próprio agendamento (scheduled)', async () => {
    await assertSucceeds(
      setDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'appointments', 'novo'), {
        customerUid: CUSTOMER_2,
        status: 'scheduled',
        startAtMs: FUTURE,
      }),
    );
  });

  test('cliente não cria agendamento no nome de outro', async () => {
    await assertFails(
      setDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'appointments', 'novo'), {
        customerUid: CUSTOMER_1,
        status: 'scheduled',
        startAtMs: FUTURE,
      }),
    );
  });

  test('cliente não cria agendamento já com status diferente de scheduled', async () => {
    await assertFails(
      setDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'appointments', 'novo'), {
        customerUid: CUSTOMER_2,
        status: 'done',
        startAtMs: FUTURE,
      }),
    );
  });
});

describe('agendamentos — cancelamento (corte no horário)', () => {
  test('cliente cancela o próprio agendamento ANTES do horário', async () => {
    await assertSucceeds(
      updateDoc(doc(authed(CUSTOMER_1), 'shops', SHOP_A, 'appointments', 'appt_future'), {
        status: 'cancelled',
        cancelledBy: CUSTOMER_1,
      }),
    );
  });

  test('cliente NÃO cancela depois do horário', async () => {
    await assertFails(
      updateDoc(doc(authed(CUSTOMER_1), 'shops', SHOP_A, 'appointments', 'appt_past'), {
        status: 'cancelled',
        cancelledBy: CUSTOMER_1,
      }),
    );
  });

  test('cliente NÃO cancela agendamento de outro cliente', async () => {
    await assertFails(
      updateDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'appointments', 'appt_future'), {
        status: 'cancelled',
        cancelledBy: CUSTOMER_2,
      }),
    );
  });

  test('cliente não muda o status para algo além de cancelled', async () => {
    await assertFails(
      updateDoc(doc(authed(CUSTOMER_1), 'shops', SHOP_A, 'appointments', 'appt_future'), {
        status: 'done',
      }),
    );
  });

  test('dono muda o status do agendamento (in_progress)', async () => {
    await assertSucceeds(
      updateDoc(doc(authed(OWNER_A), 'shops', SHOP_A, 'appointments', 'appt_future'), {
        status: 'in_progress',
      }),
    );
  });
});

describe('agendamentos — leitura (só dono e o próprio cliente)', () => {
  test('não logado não lê agendamentos', async () => {
    await assertFails(getDoc(doc(anon(), 'shops', SHOP_A, 'appointments', 'appt_future')));
  });

  test('o próprio cliente lê o seu agendamento', async () => {
    await assertSucceeds(
      getDoc(doc(authed(CUSTOMER_1), 'shops', SHOP_A, 'appointments', 'appt_future')),
    );
  });

  test('o dono lê os agendamentos do seu shop', async () => {
    await assertSucceeds(
      getDoc(doc(authed(OWNER_A), 'shops', SHOP_A, 'appointments', 'appt_future')),
    );
  });

  test('outro cliente NÃO lê o agendamento alheio (não vaza nome)', async () => {
    await assertFails(
      getDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'appointments', 'appt_future')),
    );
  });
});

describe('slots (espelho sem PII p/ disponibilidade)', () => {
  const validSlot = extra => ({
    startAtMs: FUTURE,
    endAtMs: FUTURE + 30 * 60 * 1000,
    dayKey: 'd1',
    shopId: SHOP_A,
    ...extra,
  });

  test('qualquer logado lê os slots (cálculo de disponibilidade)', async () => {
    await assertSucceeds(getDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'slots', 'slot_read')));
  });

  test('não logado não lê slots', async () => {
    await assertFails(getDoc(doc(anon(), 'shops', SHOP_A, 'slots', 'slot_read')));
  });

  test('o cliente cria o slot do seu agendamento (getAfter casa dono+horário)', async () => {
    // appt_future pertence a CUSTOMER_1 e ainda não tem slot.
    await assertSucceeds(
      setDoc(doc(authed(CUSTOMER_1), 'shops', SHOP_A, 'slots', 'appt_future'), validSlot()),
    );
  });

  test('não cria slot para o agendamento de outro cliente', async () => {
    await assertFails(
      setDoc(doc(authed(CUSTOMER_2), 'shops', SHOP_A, 'slots', 'appt_future'), validSlot()),
    );
  });

  test('não cria slot com campo de PII (hasOnly)', async () => {
    await assertFails(
      setDoc(
        doc(authed(CUSTOMER_1), 'shops', SHOP_A, 'slots', 'appt_future'),
        validSlot({ customerName: 'Fulano' }),
      ),
    );
  });

  test('não cria slot com horário diferente do agendamento', async () => {
    await assertFails(
      setDoc(
        doc(authed(CUSTOMER_1), 'shops', SHOP_A, 'slots', 'appt_future'),
        validSlot({ startAtMs: FUTURE + 999 }),
      ),
    );
  });
});

describe('notificações do sino do dono', () => {
  test('dono lê as próprias notificações', async () => {
    await assertSucceeds(getDoc(doc(authed(OWNER_A), 'shops', SHOP_A, 'notifications', 'n1')));
  });

  test('cliente não lê notificações do shop', async () => {
    await assertFails(getDoc(doc(authed(CUSTOMER_1), 'shops', SHOP_A, 'notifications', 'n1')));
  });
});

describe('documento do usuário', () => {
  test('usuário escreve o próprio doc', async () => {
    await assertSucceeds(setDoc(doc(authed(CUSTOMER_1), 'users', CUSTOMER_1), { name: 'Fulano' }));
  });

  test('usuário não escreve o doc de outro', async () => {
    await assertFails(setDoc(doc(authed(CUSTOMER_2), 'users', CUSTOMER_1), { name: 'hack' }));
  });

  // O cadastro cria o doc com o papel — é assim que o app registra a conta.
  const cadastrar = () =>
    setDoc(doc(authed(CUSTOMER_1), 'users', CUSTOMER_1), {
      uid: CUSTOMER_1,
      role: 'customer',
      shopId: null,
    });

  test('o cadastro grava o papel', async () => {
    await assertSucceeds(cadastrar());
  });

  // Auditoria de 26/08/2026: sem esta trava o cliente virava dono sozinho e
  // caía na interface do painel do estabelecimento.
  test('cliente não se promove a dono depois do cadastro', async () => {
    await cadastrar();

    await assertFails(updateDoc(doc(authed(CUSTOMER_1), 'users', CUSTOMER_1), { role: 'owner' }));
  });

  test('mas atualiza os próprios dados normalmente', async () => {
    await cadastrar();

    await assertSucceeds(
      updateDoc(doc(authed(CUSTOMER_1), 'users', CUSTOMER_1), { firstName: 'Ana' }),
    );
  });

  // O app grava a "última estética usada" a cada agendamento — travar o shopId
  // junto com o role quebraria esse fluxo.
  test('a última estética usada continua gravável', async () => {
    await cadastrar();

    await assertSucceeds(
      updateDoc(doc(authed(CUSTOMER_1), 'users', CUSTOMER_1), { shopId: SHOP_A }),
    );
  });
});

describe('pagamentos', () => {
  // Auditoria de 26/08/2026: a regra antiga era `allow read: if isSignedIn()`,
  // então qualquer cliente logado lia o valor e o status de todas as cobranças.
  test('cliente não lê cobrança de estética alguma', async () => {
    await assertFails(getDoc(doc(authed(CUSTOMER_1), 'payments', 'pay_a')));
  });

  test('dono de outra estética também não lê', async () => {
    await assertFails(getDoc(doc(authed(OWNER_B), 'payments', 'pay_a')));
  });

  test('o dono cobrado lê a própria cobrança', async () => {
    await assertSucceeds(getDoc(doc(authed(OWNER_A), 'payments', 'pay_a')));
  });

  test('ninguém escreve pagamento pelo cliente', async () => {
    await assertFails(setDoc(doc(authed(OWNER_A), 'payments', 'pay_novo'), { amount: 1 }));
  });
});
