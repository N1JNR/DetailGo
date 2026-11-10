/**
 * O que impede a exclusão de uma conta, e por quê.
 *
 * Separado da função HTTP de propósito: aqui mora a decisão, e dá para testar
 * cada regra sem Firestore, sem rede e sem Admin SDK. A função lá fora só
 * coleta os fatos e executa o veredito.
 *
 * O Google Play exige poder **solicitar** exclusão — não exige exclusão
 * incondicional e instantânea. Recusar explicando o que resolver é conduta
 * aceita, e é melhor que apagar a loja por baixo de cliente com horário
 * marcado.
 */

export type FatosDaConta = {
  /** Papel gravado em `users/{uid}.role`. */
  papel: 'owner' | 'customer' | null;
  /** Loja da qual a pessoa é dona, se houver. */
  shopId: string | null;
  /** Há recorrência viva no Asaas para essa loja. */
  assinaturaAtiva: boolean;
  /** Agendamentos ainda por acontecer na loja dela. */
  agendamentosFuturos: number;
};

export type Impedimento = {
  codigo: 'assinatura_ativa' | 'agendamentos_futuros';
  mensagem: string;
};

export type Veredito =
  | { pode: true; apagaLoja: boolean }
  | { pode: false; impedimentos: Impedimento[] };

/**
 * Decide se a conta pode sair agora.
 *
 * Cliente nunca é barrado: o que ele tem é dele. Quem pode ser barrado é o
 * dono, porque a loja dele contém dinheiro em curso e compromisso com
 * terceiros.
 */
export function avaliarExclusao(fatos: FatosDaConta): Veredito {
  const ehDonoComLoja = fatos.papel === 'owner' && !!fatos.shopId;

  if (!ehDonoComLoja) return { pode: true, apagaLoja: false };

  const impedimentos: Impedimento[] = [];

  // Primeiro a assinatura: sair com recorrência viva continua gerando cobrança
  // numa conta que não existe mais, e o estorno depois é muito mais caro que o
  // aviso agora.
  if (fatos.assinaturaAtiva) {
    impedimentos.push({
      codigo: 'assinatura_ativa',
      mensagem: 'Cancele a assinatura antes de excluir a conta, senão a cobrança continua.',
    });
  }

  // Agendamento futuro é compromisso com outra pessoa. Apagar a loja por baixo
  // dela a deixa com horário marcado numa estética que sumiu do mapa.
  if (fatos.agendamentosFuturos > 0) {
    impedimentos.push({
      codigo: 'agendamentos_futuros',
      mensagem:
        fatos.agendamentosFuturos === 1
          ? 'Há 1 agendamento futuro na sua estética. Conclua ou cancele antes de excluir a conta.'
          : `Há ${fatos.agendamentosFuturos} agendamentos futuros na sua estética. Conclua ou cancele antes de excluir a conta.`,
    });
  }

  if (impedimentos.length > 0) return { pode: false, impedimentos };

  return { pode: true, apagaLoja: true };
}
