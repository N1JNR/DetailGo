import { renderHook, waitFor } from '@testing-library/react-native';

const mockWatchUserNotifications = jest.fn();

jest.mock('../services/notifications.service', () => ({
  watchUserNotifications: (...args: unknown[]) => mockWatchUserNotifications(...args),
}));

import { useUserNotifications } from './useUserNotifications';

describe('useUserNotifications', () => {
  beforeEach(() => {
    mockWatchUserNotifications.mockReset();
  });

  it('retorna lista vazia e loading false se uid for nulo ou indefinido', () => {
    const { result, rerender } = renderHook(
      ({ uid }: { uid?: string | null }) => useUserNotifications(uid),
      { initialProps: { uid: null } },
    );

    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.loading).toBe(false);
    expect(mockWatchUserNotifications).not.toHaveBeenCalled();

    rerender({ uid: undefined });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('assina notificações do usuário e calcula unreadCount', async () => {
    const mockUnsub = jest.fn();
    mockWatchUserNotifications.mockImplementation((uid, onData) => {
      onData([
        { id: 'u1', title: 'Lembrete 1', read: false },
        { id: 'u2', title: 'Lembrete 2', read: false },
      ]);
      return mockUnsub;
    });

    const { result } = renderHook(() => useUserNotifications('user-123'));

    expect(mockWatchUserNotifications).toHaveBeenCalledWith(
      'user-123',
      expect.any(Function),
      expect.any(Function),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.unreadCount).toBe(2);
  });

  it('trata erro alterando loading para false', async () => {
    mockWatchUserNotifications.mockImplementation((uid, onData, onError) => {
      onError(new Error('Erro ao carregar'));
      return jest.fn();
    });

    const { result } = renderHook(() => useUserNotifications('user-err'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('cancela a assinatura ao desmontar', () => {
    const mockUnsub = jest.fn();
    mockWatchUserNotifications.mockReturnValue(mockUnsub);

    const { unmount } = renderHook(() => useUserNotifications('user-123'));

    unmount();

    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });
});
