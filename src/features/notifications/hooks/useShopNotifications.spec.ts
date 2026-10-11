import { renderHook, waitFor } from '@testing-library/react-native';

const mockWatchShopNotifications = jest.fn();

jest.mock('../services/notifications.service', () => ({
  watchShopNotifications: (...args: unknown[]) => mockWatchShopNotifications(...args),
}));

import { useShopNotifications } from './useShopNotifications';

describe('useShopNotifications', () => {
  beforeEach(() => {
    mockWatchShopNotifications.mockReset();
  });

  it('retorna lista vazia e loading false se shopId for nulo ou indefinido', () => {
    const { result, rerender } = renderHook(
      ({ shopId }: { shopId?: string | null }) => useShopNotifications(shopId),
      { initialProps: { shopId: null } },
    );

    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.loading).toBe(false);
    expect(mockWatchShopNotifications).not.toHaveBeenCalled();

    rerender({ shopId: undefined });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('assina notificações do shop e calcula unreadCount corretamente', async () => {
    const mockUnsub = jest.fn();
    mockWatchShopNotifications.mockImplementation((shopId, onData) => {
      onData([
        { id: 'n1', title: 'Agendamento 1', read: false },
        { id: 'n2', title: 'Agendamento 2', read: true },
        { id: 'n3', title: 'Agendamento 3', read: false },
      ]);
      return mockUnsub;
    });

    const { result } = renderHook(() => useShopNotifications('shop-999'));

    expect(mockWatchShopNotifications).toHaveBeenCalledWith(
      'shop-999',
      expect.any(Function),
      expect.any(Function),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(3);
    expect(result.current.unreadCount).toBe(2);
  });

  it('trata erro no callback do listener alterando loading para false', async () => {
    mockWatchShopNotifications.mockImplementation((shopId, onData, onError) => {
      onError(new Error('Erro de conexão'));
      return jest.fn();
    });

    const { result } = renderHook(() => useShopNotifications('shop-err'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('cancela a assinatura do listener ao desmontar o hook', () => {
    const mockUnsub = jest.fn();
    mockWatchShopNotifications.mockReturnValue(mockUnsub);

    const { unmount } = renderHook(() => useShopNotifications('shop-999'));

    unmount();

    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });
});
