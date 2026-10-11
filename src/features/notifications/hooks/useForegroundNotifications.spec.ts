import { renderHook, waitFor } from '@testing-library/react-native';

const mockEnsureNotificationChannel = jest.fn();
const mockDisplayPushNotification = jest.fn();
const mockOnMessage = jest.fn();
const mockGetMessaging = jest.fn();

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: (...args: unknown[]) => mockGetMessaging(...args),
  onMessage: (...args: unknown[]) => mockOnMessage(...args),
}));

jest.mock('../services/notifee.service', () => ({
  ensureNotificationChannel: (...args: unknown[]) => mockEnsureNotificationChannel(...args),
  displayPushNotification: (...args: unknown[]) => mockDisplayPushNotification(...args),
}));

import { useForegroundNotifications } from './useForegroundNotifications';

describe('useForegroundNotifications', () => {
  beforeEach(() => {
    mockEnsureNotificationChannel.mockReset();
    mockDisplayPushNotification.mockReset();
    mockOnMessage.mockReset();
    mockGetMessaging.mockReset();

    mockEnsureNotificationChannel.mockResolvedValue(undefined);
    mockDisplayPushNotification.mockResolvedValue(undefined);
    mockGetMessaging.mockReturnValue({});
  });

  it('garante o canal de notificação e assina mensagens em primeiro plano (foreground)', async () => {
    const mockUnsub = jest.fn();
    mockOnMessage.mockReturnValue(mockUnsub);

    renderHook(() => useForegroundNotifications());

    await waitFor(() => {
      expect(mockEnsureNotificationChannel).toHaveBeenCalled();
      expect(mockOnMessage).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
    });
  });

  it('exibe notificação push quando uma mensagem chega via onMessage com valores padrão se vazios', async () => {
    let messageHandler: ((msg: unknown) => Promise<void>) | undefined;
    mockOnMessage.mockImplementation((_messaging, handler) => {
      messageHandler = handler;
      return jest.fn();
    });

    renderHook(() => useForegroundNotifications());

    await waitFor(() => {
      expect(messageHandler).toBeDefined();
    });

    // Dispara mensagem sem título nem corpo
    await messageHandler!({
      notification: undefined,
      data: { type: 'appointment' },
    });

    expect(mockDisplayPushNotification).toHaveBeenCalledWith('Nova notificação', '', {
      type: 'appointment',
    });

    // Dispara mensagem com título e corpo definidos
    await messageHandler!({
      notification: { title: 'Novo Agendamento', body: 'Lembrete às 14h' },
      data: { id: 'app-1' },
    });

    expect(mockDisplayPushNotification).toHaveBeenCalledWith(
      'Novo Agendamento',
      'Lembrete às 14h',
      { id: 'app-1' },
    );
  });

  it('cancela a assinatura do onMessage ao desmontar', async () => {
    const mockUnsub = jest.fn();
    mockOnMessage.mockReturnValue(mockUnsub);

    const { unmount } = renderHook(() => useForegroundNotifications());

    await waitFor(() => {
      expect(mockOnMessage).toHaveBeenCalled();
    });

    unmount();

    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });
});
