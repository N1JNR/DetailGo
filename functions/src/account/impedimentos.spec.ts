import { avaliarExclusao, type FatosDaConta } from './impedimentos';

const cliente: FatosDaConta = {
  papel: 'customer',
  shopId: null,
  assinaturaAtiva: false,
  agendamentosFuturos: 0,
};

const dono: FatosDaConta = {
  papel: 'owner',
  shopId: 'shop-1',
  assinaturaAtiva: false,
  agendamentosFuturos: 0,
};

describe('avaliarExclusao — cliente', () => {
  // O que o cliente tem é dele. Nada do que ele guarda compromete terceiro,
  // então nada o impede de sair.
  it('sempre pode sair', () => {
    expect(avaliarExclusao(cliente)).toEqual({ pode: true, apagaLoja: false });
  });

  it('não apaga loja nenhuma', () => {
    const r = avaliarExclusao(cliente);
    expect(r).toMatchObject({ apagaLoja: false });
  });

  // Agendamento futuro do cliente não o prende: quem fica sem o horário é ele
  // mesmo, e a estética vê o horário liberar.
  it('sai mesmo com agendamento futuro', () => {
    expect(avaliarExclusao({ ...cliente, agendamentosFuturos: 3 })).toMatchObject({
      pode: true,
    });
  });

  it('sai mesmo que o papel não tenha sido gravado', () => {
    expect(avaliarExclusao({ ...cliente, papel: null })).toMatchObject({ pode: true });
  });
});

describe('avaliarExclusao — dono', () => {
  it('sai quando não deve nada e apaga a loja junto', () => {
    expect(avaliarExclusao(dono)).toEqual({ pode: true, apagaLoja: true });
  });

  it('é barrado por assinatura viva', () => {
    const r = avaliarExclusao({ ...dono, assinaturaAtiva: true });

    expect(r.pode).toBe(false);
    expect(r).toMatchObject({ impedimentos: [{ codigo: 'assinatura_ativa' }] });
  });

  it('é barrado por agendamento futuro', () => {
    const r = avaliarExclusao({ ...dono, agendamentosFuturos: 1 });

    expect(r.pode).toBe(false);
    expect(r).toMatchObject({ impedimentos: [{ codigo: 'agendamentos_futuros' }] });
  });

  // Mostrar um impedimento de cada vez faria a pessoa resolver, tentar de novo
  // e descobrir o segundo. Os dois juntos de uma vez.
  it('lista os dois impedimentos juntos', () => {
    const r = avaliarExclusao({ ...dono, assinaturaAtiva: true, agendamentosFuturos: 2 });

    expect(r.pode).toBe(false);
    if (r.pode) throw new Error('deveria ter sido barrado');
    expect(r.impedimentos.map(i => i.codigo)).toEqual(['assinatura_ativa', 'agendamentos_futuros']);
  });

  it('concorda o plural da mensagem com a quantidade', () => {
    const um = avaliarExclusao({ ...dono, agendamentosFuturos: 1 });
    const varios = avaliarExclusao({ ...dono, agendamentosFuturos: 4 });

    if (um.pode || varios.pode) throw new Error('deveriam ter sido barrados');
    expect(um.impedimentos[0].mensagem).toContain('1 agendamento futuro');
    expect(varios.impedimentos[0].mensagem).toContain('4 agendamentos futuros');
  });

  it('diz o que fazer, não só que não pode', () => {
    const r = avaliarExclusao({ ...dono, assinaturaAtiva: true });

    if (r.pode) throw new Error('deveria ter sido barrado');
    expect(r.impedimentos[0].mensagem).toMatch(/cancele a assinatura/i);
  });

  // Papel 'owner' sem loja é estado inconsistente — cadastro que falhou no
  // meio. Prender a conta nesse caso deixaria a pessoa sem saída.
  it('não prende dono sem loja', () => {
    expect(avaliarExclusao({ ...dono, shopId: null, assinaturaAtiva: true })).toMatchObject({
      pode: true,
      apagaLoja: false,
    });
  });

  // A trava é do dono. Cliente com shopId preenchido é só "última estética
  // usada", e não pode virar impedimento.
  it('não confunde a última estética usada do cliente com loja própria', () => {
    const r = avaliarExclusao({
      ...cliente,
      shopId: 'shop-1',
      assinaturaAtiva: true,
      agendamentosFuturos: 5,
    });

    expect(r).toEqual({ pode: true, apagaLoja: false });
  });
});
