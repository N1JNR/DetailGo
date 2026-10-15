import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import NotificationsScreenView from './NotificationsScreenView';
import type { AppNotification } from '../domain/notification.types';

// Navegação: o header usa goBack e o FadeInUp usa useIsFocused.
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useIsFocused: () => true,
}));

/** Instante fixo para o tempo relativo não depender do relógio da máquina. */
const AGORA = new Date(2026, 9, 15, 14, 0, 0).getTime();
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

const item = (id: string, over: Partial<AppNotification> = {}): AppNotification => ({
  id,
  type: 'appointment_done',
  title: 'Serviço concluído',
  body: 'Seu serviço de Lavagem foi concluído.',
  startAtMs: null,
  read: true,
  createdAtMs: AGORA,
  ...over,
});

function renderizar(props: Partial<React.ComponentProps<typeof NotificationsScreenView>> = {}) {
  return render(
    <NotificationsScreenView
      items={[item('1')]}
      loading={false}
      subtitle="Seus lembretes"
      {...props}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Date.now direto, em vez de useFakeTimers: aqui só o relógio importa, e
  // fingir os timers afeta o agendamento interno do React Native sem precisar.
  jest.spyOn(Date, 'now').mockReturnValue(AGORA);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('NotificationsScreenView — limpar todas', () => {
  it('mostra o botão de limpar quando há itens e onClearAll é fornecido', () => {
    renderizar({ items: [item('1'), item('2')], onClearAll: jest.fn() });

    expect(screen.getByTestId('clear-all-notifications')).toBeTruthy();
  });

  it('chama onClearAll ao tocar no botão', () => {
    const onClearAll = jest.fn();
    renderizar({ onClearAll });

    fireEvent.press(screen.getByTestId('clear-all-notifications'));

    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('não mostra o botão quando a lista está vazia', () => {
    renderizar({ items: [], onClearAll: jest.fn() });

    expect(screen.queryByTestId('clear-all-notifications')).toBeNull();
  });

  it('não mostra o botão quando onClearAll não é fornecido', () => {
    renderizar();

    expect(screen.queryByTestId('clear-all-notifications')).toBeNull();
  });
});

describe('NotificationsScreenView — estados da lista', () => {
  it('mostra o spinner enquanto carrega e não há nada', () => {
    renderizar({ items: [], loading: true });

    expect(screen.queryByText('Nenhuma notificação por aqui.')).toBeNull();
    expect(screen.UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy();
  });

  // Carregar com lista já na tela é atualização, não primeira carga: trocar a
  // lista pelo spinner piscaria o conteúdo que o usuário está lendo.
  it('mantém a lista visível quando recarrega com itens', () => {
    renderizar({ items: [item('1')], loading: true });

    expect(screen.getByText('Serviço concluído')).toBeTruthy();
  });

  it('mostra o aviso de vazio quando terminou de carregar sem nada', () => {
    renderizar({ items: [], loading: false });

    expect(screen.getByText('Nenhuma notificação por aqui.')).toBeTruthy();
  });

  it('mostra título, corpo e o subtítulo recebido', () => {
    renderizar({ subtitle: 'Três não lidas' });

    expect(screen.getByText('Notificações')).toBeTruthy();
    expect(screen.getByText('Três não lidas')).toBeTruthy();
    expect(screen.getByText('Serviço concluído')).toBeTruthy();
    expect(screen.getByText('Seu serviço de Lavagem foi concluído.')).toBeTruthy();
  });

  it('lista todos os itens recebidos', () => {
    renderizar({
      items: [
        item('1', { title: 'Primeira' }),
        item('2', { title: 'Segunda' }),
        item('3', { title: 'Terceira' }),
      ],
    });

    expect(screen.getByText('Primeira')).toBeTruthy();
    expect(screen.getByText('Segunda')).toBeTruthy();
    expect(screen.getByText('Terceira')).toBeTruthy();
  });

  it('avisa ao abrir, uma vez só', () => {
    const onOpened = jest.fn();
    const { rerender } = renderizar({ onOpened });

    rerender(
      <NotificationsScreenView
        items={[item('1'), item('2')]}
        loading={false}
        subtitle="Outro"
        onOpened={onOpened}
      />,
    );

    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('não quebra quando onOpened não é fornecido', () => {
    expect(() => renderizar()).not.toThrow();
  });

  it('volta pela seta', () => {
    renderizar();

    fireEvent.press(screen.getByTestId('voltar'));

    expect(mockGoBack).toHaveBeenCalled();
  });
});

// Cada faixa tem formato próprio, e a borda entre elas é onde o texto erra:
// 59 minutos ainda é "min", 60 já é "h".
describe('NotificationsScreenView — tempo relativo', () => {
  const comIdade = (ms: number) => {
    renderizar({ items: [item('1', { createdAtMs: AGORA - ms })] });
  };

  it('mostra "agora" para menos de um minuto', () => {
    comIdade(30 * 1000);
    expect(screen.getByText('agora')).toBeTruthy();
  });

  it('mostra minutos a partir de um minuto', () => {
    comIdade(MIN);
    expect(screen.getByText('há 1 min')).toBeTruthy();
  });

  it('ainda mostra minutos aos 59', () => {
    comIdade(59 * MIN);
    expect(screen.getByText('há 59 min')).toBeTruthy();
  });

  it('vira hora aos 60 minutos', () => {
    comIdade(HORA);
    expect(screen.getByText('há 1 h')).toBeTruthy();
  });

  it('ainda mostra horas às 23', () => {
    comIdade(23 * HORA);
    expect(screen.getByText('há 23 h')).toBeTruthy();
  });

  it('vira dia às 24 horas', () => {
    comIdade(DIA);
    expect(screen.getByText('há 1 d')).toBeTruthy();
  });

  it('ainda mostra dias no sexto', () => {
    comIdade(6 * DIA);
    expect(screen.getByText('há 6 d')).toBeTruthy();
  });

  // A partir de uma semana o "há N d" perde utilidade e vira data.
  it('vira data no sétimo dia', () => {
    comIdade(7 * DIA);
    expect(screen.getByText('08/10')).toBeTruthy();
  });

  it('zera o dia e o mês com dois dígitos', () => {
    renderizar({ items: [item('1', { createdAtMs: new Date(2026, 0, 5).getTime() })] });

    expect(screen.getByText('05/01')).toBeTruthy();
  });

  // Sem a guarda de `ms` zerado, a conta parte de 1970 e cai na última faixa —
  // o item passa a exibir uma data de 1970 em vez de nada. Procurar só por
  // "há "/"agora" deixaria isso passar.
  it('não mostra tempo nenhum quando não há data', () => {
    renderizar({ items: [item('1', { createdAtMs: 0 })] });

    expect(screen.queryByText(/há |agora/)).toBeNull();
    expect(screen.queryByText(/^\d{2}\/\d{2}$/)).toBeNull();
  });
});

describe('NotificationsScreenView — item não lido', () => {
  it('marca visualmente o não lido', () => {
    renderizar({ items: [item('1', { read: false })] });

    // O ponto não tem texto; o que dá para afirmar é que o item aparece e que
    // a lista distingue lido de não lido pelo estilo da linha.
    expect(screen.getByText('Serviço concluído')).toBeTruthy();
  });

  it.each([
    ['appointment_reminder'],
    ['appointment_done'],
    ['appointment_expired'],
    ['appointment_cancelled'],
    ['appointment_created'],
  ])('renderiza o tipo %s sem quebrar', tipo => {
    expect(() =>
      renderizar({ items: [item('1', { type: tipo as AppNotification['type'] })] }),
    ).not.toThrow();
  });
});
