import { renderHook, waitFor } from '@testing-library/react-native';

const mockOnSnapshot = jest.fn();
const mockEnsureShopServices = jest.fn();
const mockShopServicesQuery = jest.fn();
const mockNormalizeShopService = jest.fn();

jest.mock('@react-native-firebase/firestore', () => ({
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

jest.mock('../services/shopServices.service', () => ({
  ensureShopServices: (...args: unknown[]) => mockEnsureShopServices(...args),
  normalizeShopService: (...args: unknown[]) => mockNormalizeShopService(...args),
  shopServicesQuery: (...args: unknown[]) => mockShopServicesQuery(...args),
}));

import { useShopServices } from './useShopServices';

describe('useShopServices', () => {
  beforeEach(() => {
    mockOnSnapshot.mockReset();
    mockEnsureShopServices.mockReset();
    mockShopServicesQuery.mockReset();
    mockNormalizeShopService.mockReset();

    mockShopServicesQuery.mockImplementation((shopId: string) => `QUERY_FOR_${shopId}`);
    mockEnsureShopServices.mockResolvedValue([]);
  });

  it('retorna lista vazia e loading false se shopId for nulo', () => {
    const { result } = renderHook(() => useShopServices({ shopId: null }));

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(mockEnsureShopServices).not.toHaveBeenCalled();
  });

  it('inscreve no Firestore e carrega os serviços normalizados para o shopId fornecido', async () => {
    const mockUnsub = jest.fn();
    mockOnSnapshot.mockImplementation((queryRef, callback) => {
      callback({
        docs: [
          { id: 's1', data: () => ({ name: 'Lavagem' }) },
          { id: 's2', data: () => ({ name: 'Polimento' }) },
        ],
      });
      return mockUnsub;
    });

    mockNormalizeShopService.mockImplementation(docSnap => ({
      id: docSnap.id,
      name: docSnap.data().name,
      active: true,
    }));

    const { result } = renderHook(() => useShopServices({ shopId: 'shop-123' }));

    expect(mockShopServicesQuery).toHaveBeenCalledWith('shop-123');
    expect(mockOnSnapshot).toHaveBeenCalledWith(
      'QUERY_FOR_shop-123',
      expect.any(Function),
      expect.any(Function),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0]).toEqual({ id: 's1', name: 'Lavagem', active: true });
    expect(result.current.items[1]).toEqual({ id: 's2', name: 'Polimento', active: true });
  });

  it('filtra apenas os serviços ativos quando activeOnly for true', async () => {
    mockOnSnapshot.mockImplementation((queryRef, callback) => {
      callback({
        docs: [
          { id: 's1', data: () => ({ name: 'Lavagem', active: true }) },
          { id: 's2', data: () => ({ name: 'Polimento', active: false }) },
        ],
      });
      return jest.fn();
    });

    mockNormalizeShopService.mockImplementation(docSnap => ({
      id: docSnap.id,
      name: docSnap.data().name,
      active: docSnap.data().active,
    }));

    const { result } = renderHook(() => useShopServices({ shopId: 'shop-123', activeOnly: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toEqual({ id: 's1', name: 'Lavagem', active: true });
  });

  // O padrão é mostrar tudo. Se activeOnly nascesse true, o dono abriria a
  // gestão da loja e não veria os serviços que ele mesmo desativou — some sem
  // explicação, e ele não teria como reativar.
  it('mostra também os inativos quando activeOnly não é informado', async () => {
    mockOnSnapshot.mockImplementation((queryRef, callback) => {
      callback({
        docs: [
          { id: 's1', data: () => ({ name: 'Lavagem', active: true }) },
          { id: 's2', data: () => ({ name: 'Polimento', active: false }) },
        ],
      });
      return jest.fn();
    });

    mockNormalizeShopService.mockImplementation(docSnap => ({
      id: docSnap.id,
      name: docSnap.data().name,
      active: docSnap.data().active,
    }));

    const { result } = renderHook(() => useShopServices({ shopId: 'shop-123' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(2);
  });

  it('chama ensureShopServices com o shopId correto quando ensureDefaults for true', async () => {
    mockOnSnapshot.mockImplementation(() => jest.fn());

    renderHook(() => useShopServices({ shopId: 'shop-xyz', ensureDefaults: true }));

    expect(mockEnsureShopServices).toHaveBeenCalledWith('shop-xyz');
  });

  // O padrão é não criar nada. Se ensureDefaults nascesse true, qualquer tela
  // que apenas lê a lista semearia os serviços padrão na loja — inclusive
  // ressuscitando os que o dono já tinha apagado.
  it('não cria serviços padrão quando ensureDefaults não é informado', async () => {
    mockOnSnapshot.mockImplementation(() => jest.fn());

    renderHook(() => useShopServices({ shopId: 'shop-xyz' }));

    expect(mockEnsureShopServices).not.toHaveBeenCalled();
  });

  it('define loading como false em caso de erro na chamada do snapshot ou ensureDefaults', async () => {
    mockEnsureShopServices.mockRejectedValueOnce(new Error('Falha ao semear'));
    mockOnSnapshot.mockImplementation((queryRef, onNext, onError) => {
      onError(new Error('Erro de permissão ou rede'));
      return jest.fn();
    });

    const { result } = renderHook(() =>
      useShopServices({ shopId: 'shop-err', ensureDefaults: true }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
  });

  it('cancela a inscrição do Firestore ao desmontar o hook', () => {
    const mockUnsub = jest.fn();
    mockOnSnapshot.mockReturnValue(mockUnsub);

    const { unmount } = renderHook(() => useShopServices({ shopId: 'shop-123' }));

    unmount();

    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });
});
