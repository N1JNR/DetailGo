import { renderHook, waitFor } from '@testing-library/react-native';

const mockEnsureNotificationChannel = jest.fn();
const mockRequestPushPermission = jest.fn();
const mockRegisterFcmToken = jest.fn();

jest.mock('../services/notifee.service', () => ({
  ensureNotificationChannel: (...args: unknown[]) => mockEnsureNotificationChannel(...args),
}));

jest.mock('../services/push.service', () => ({
  requestPushPermission: (...args: unknown[]) => mockRequestPushPermission(...args),
  registerFcmToken: (...args: unknown[]) => mockRegisterFcmToken(...args),
}));

import { useRegisterPushToken } from './useRegisterPushToken';

describe('useRegisterPushToken', () => {
  beforeEach(() => {
    mockEnsureNotificationChannel.mockReset();
    mockRequestPushPermission.mockReset();
    mockRegisterFcmToken.mockReset();

    mockEnsureNotificationChannel.mockResolvedValue(undefined);
    mockRequestPushPermission.mockResolvedValue(true);
    mockRegisterFcmToken.mockResolvedValue(jest.fn());
  });

  it('não executa registro se uid for nulo ou indefinido', () => {
    renderHook(() => useRegisterPushToken(null));

    expect(mockEnsureNotificationChannel).not.toHaveBeenCalled();
    expect(mockRequestPushPermission).not.toHaveBeenCalled();
    expect(mockRegisterFcmToken).not.toHaveBeenCalled();
  });

  it('garante canal, solicita permissão e registra o FCM token do usuário', async () => {
    const mockUnsubRefresh = jest.fn();
    mockRegisterFcmToken.mockResolvedValueOnce(mockUnsubRefresh);

    renderHook(() => useRegisterPushToken('usr-777'));

    await waitFor(() => {
      expect(mockEnsureNotificationChannel).toHaveBeenCalled();
      expect(mockRequestPushPermission).toHaveBeenCalled();
      expect(mockRegisterFcmToken).toHaveBeenCalledWith('usr-777');
    });
  });

  it('cancela a assinatura do token refresh ao desmontar se a promessa resolveu', async () => {
    const mockUnsubRefresh = jest.fn();
    mockRegisterFcmToken.mockResolvedValueOnce(mockUnsubRefresh);

    const { unmount } = renderHook(() => useRegisterPushToken('usr-777'));

    await waitFor(() => {
      expect(mockRegisterFcmToken).toHaveBeenCalledWith('usr-777');
    });

    unmount();

    expect(mockUnsubRefresh).toHaveBeenCalled();
  });

  it('cancela a execução assíncrona se o hook for desmontado antes de finalizar', async () => {
    const mockUnsubRefresh = jest.fn();
    mockEnsureNotificationChannel.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(undefined), 50)),
    );
    mockRegisterFcmToken.mockResolvedValue(mockUnsubRefresh);

    const { unmount } = renderHook(() => useRegisterPushToken('usr-777'));

    unmount();

    await waitFor(() => {
      expect(mockEnsureNotificationChannel).toHaveBeenCalled();
    });
  });
});
