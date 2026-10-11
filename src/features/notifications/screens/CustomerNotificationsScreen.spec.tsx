import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockUseUserNotifications = jest.fn();
const mockMarkAllUserNotificationsRead = jest.fn();
const mockClearUserNotifications = jest.fn();
const mockShowConfirm = jest.fn();
const mockShowError = jest.fn();
const mockGetAuth = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => mockGetAuth(),
}));

jest.mock('../hooks/useUserNotifications', () => ({
  useUserNotifications: (uid: string | null) => mockUseUserNotifications(uid),
}));

jest.mock('../services/notifications.service', () => ({
  markAllUserNotificationsRead: (...args: unknown[]) => mockMarkAllUserNotificationsRead(...args),
  clearUserNotifications: (...args: unknown[]) => mockClearUserNotifications(...args),
}));

jest.mock('@shared/components/FeedbackProvider', () => ({
  useFeedback: () => ({
    showConfirm: mockShowConfirm,
    showError: mockShowError,
  }),
}));

import CustomerNotificationsScreen from './CustomerNotificationsScreen';

describe('CustomerNotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuth.mockReturnValue({ currentUser: { uid: 'user-789' } });
    mockUseUserNotifications.mockReturnValue({
      items: [{ id: 'u1', title: 'Lembrete de Lavagem', body: 'Amanhã às 10h', read: false }],
      loading: false,
    });
    mockMarkAllUserNotificationsRead.mockResolvedValue(undefined);
    mockClearUserNotifications.mockResolvedValue(undefined);
  });

  it('renderiza as notificações do cliente e marca todas como lidas', async () => {
    render(<CustomerNotificationsScreen />);

    expect(screen.getByText('Lembrete de Lavagem')).toBeTruthy();
    expect(screen.getByText('Amanhã às 10h')).toBeTruthy();

    await waitFor(() => {
      expect(mockMarkAllUserNotificationsRead).toHaveBeenCalledWith('user-789');
    });
  });

  it('exibe modal de confirmação ao clicar em limpar tudo e executa clearUserNotifications no onConfirm', async () => {
    render(<CustomerNotificationsScreen />);

    const clearBtn = screen.getByTestId('clear-all-notifications');
    fireEvent.press(clearBtn);

    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Limpar notificações',
        confirmLabel: 'Limpar tudo',
        destructive: true,
        onConfirm: expect.any(Function),
      }),
    );

    const onConfirmCb = mockShowConfirm.mock.calls[0][0].onConfirm;
    await onConfirmCb();

    expect(mockClearUserNotifications).toHaveBeenCalledWith('user-789');
  });

  it('exibe erro caso a limpeza de notificações do usuário falhe', async () => {
    mockClearUserNotifications.mockRejectedValueOnce(new Error('Erro ao limpar'));
    render(<CustomerNotificationsScreen />);

    fireEvent.press(screen.getByTestId('clear-all-notifications'));

    const onConfirmCb = mockShowConfirm.mock.calls[0][0].onConfirm;
    await onConfirmCb();

    expect(mockShowError).toHaveBeenCalledWith('Não foi possível limpar as notificações agora.');
  });

  it('não marca nem exibe botão de limpar se o usuário não estiver autenticado (uid nulo)', async () => {
    mockGetAuth.mockReturnValue({ currentUser: null });
    mockUseUserNotifications.mockReturnValue({ items: [], loading: false });

    render(<CustomerNotificationsScreen />);

    expect(mockMarkAllUserNotificationsRead).not.toHaveBeenCalled();
    expect(screen.queryByTestId('clear-all-notifications')).toBeNull();
  });
});
