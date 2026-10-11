import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockUseShopNotifications = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();
const mockClearShopNotifications = jest.fn();
const mockShowConfirm = jest.fn();
const mockShowError = jest.fn();
const mockUseShop = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('@features/shops', () => ({
  useShop: () => mockUseShop(),
}));

jest.mock('../hooks/useShopNotifications', () => ({
  useShopNotifications: (shopId: string | null) => mockUseShopNotifications(shopId),
}));

jest.mock('../services/notifications.service', () => ({
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
  clearShopNotifications: (...args: unknown[]) => mockClearShopNotifications(...args),
}));

jest.mock('@shared/components/FeedbackProvider', () => ({
  useFeedback: () => ({
    showConfirm: mockShowConfirm,
    showError: mockShowError,
  }),
}));

import NotificationsScreen from './NotificationsScreen';

describe('NotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseShop.mockReturnValue({ shopId: 'shop-123' });
    mockUseShopNotifications.mockReturnValue({
      items: [{ id: 'n1', title: 'Novo Agendamento', body: 'Lava-rápido hoje', read: false }],
      loading: false,
    });
    mockMarkAllNotificationsRead.mockResolvedValue(undefined);
    mockClearShopNotifications.mockResolvedValue(undefined);
  });

  it('renderiza as notificações da estética e chama markAllNotificationsRead ao carregar', async () => {
    render(<NotificationsScreen />);

    expect(screen.getByText('Novo Agendamento')).toBeTruthy();
    expect(screen.getByText('Lava-rápido hoje')).toBeTruthy();

    await waitFor(() => {
      expect(mockMarkAllNotificationsRead).toHaveBeenCalledWith('shop-123');
    });
  });

  it('exibe modal de confirmação ao clicar em limpar tudo e executa clearShopNotifications no onConfirm', async () => {
    render(<NotificationsScreen />);

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

    expect(mockClearShopNotifications).toHaveBeenCalledWith('shop-123');
  });

  it('exibe erro caso a limpeza de notificações falhe', async () => {
    mockClearShopNotifications.mockRejectedValueOnce(new Error('Erro de conexão'));
    render(<NotificationsScreen />);

    fireEvent.press(screen.getByTestId('clear-all-notifications'));

    const onConfirmCb = mockShowConfirm.mock.calls[0][0].onConfirm;
    await onConfirmCb();

    expect(mockShowError).toHaveBeenCalledWith('Não foi possível limpar as notificações agora.');
  });

  it('não dispara markAllNotificationsRead nem exibe botão de limpar se shopId for nulo', async () => {
    mockUseShop.mockReturnValue({ shopId: null });
    mockUseShopNotifications.mockReturnValue({ items: [], loading: false });

    render(<NotificationsScreen />);

    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
    expect(screen.queryByTestId('clear-all-notifications')).toBeNull();
  });
});
