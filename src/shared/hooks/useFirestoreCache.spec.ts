import { renderHook, act } from '@testing-library/react-native';

const mockDoc = jest.fn();
const mockGetDoc = jest.fn();

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

import { useFirestoreCache, useCustomerName } from './useFirestoreCache';

describe('useFirestoreCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retorna o valor calculado pelo fetcher na primeira chamada e do cache nas chamadas subsequentes dentro do cacheTime', async () => {
    const { result } = renderHook(() => useFirestoreCache<string>(1000));
    const fetcher = jest.fn().mockResolvedValue('resultado-1');

    let val1: string | undefined;
    await act(async () => {
      val1 = await result.current.get('key-1', fetcher);
    });

    expect(val1).toBe('resultado-1');
    expect(fetcher).toHaveBeenCalledTimes(1);

    let val2: string | undefined;
    await act(async () => {
      val2 = await result.current.get('key-1', fetcher);
    });

    expect(val2).toBe('resultado-1');
    expect(fetcher).toHaveBeenCalledTimes(1); // Não chamou fetcher novamente
  });

  it('chama o fetcher novamente se o tempo do cache tiver expirado', async () => {
    const { result } = renderHook(() => useFirestoreCache<string>(1000));
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce('resultado-1')
      .mockResolvedValueOnce('resultado-2');

    await act(async () => {
      await result.current.get('key-1', fetcher);
    });

    // Avança o tempo além dos 1000ms de cacheTime
    act(() => {
      jest.advanceTimersByTime(1001);
    });

    let val2: string | undefined;
    await act(async () => {
      val2 = await result.current.get('key-1', fetcher);
    });

    expect(val2).toBe('resultado-2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('permite invalidar uma chave específica com invalidate()', async () => {
    const { result } = renderHook(() => useFirestoreCache<string>(5000));
    const fetcher = jest.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

    await act(async () => {
      await result.current.get('path-a', fetcher);
    });

    act(() => {
      result.current.invalidate('path-a');
    });

    let val2: string | undefined;
    await act(async () => {
      val2 = await result.current.get('path-a', fetcher);
    });

    expect(val2).toBe('v2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  // Com uma chave só, invalidate('a') e clear() são indistinguíveis. É preciso
  // uma segunda chave para provar que a invalidação é cirúrgica.
  it('invalidate derruba só a chave pedida e preserva as outras', async () => {
    const { result } = renderHook(() => useFirestoreCache<string>(5000));
    const buscarA = jest.fn().mockResolvedValue('a');
    const buscarB = jest.fn().mockResolvedValue('b');

    await act(async () => {
      await result.current.get('path-a', buscarA);
      await result.current.get('path-b', buscarB);
    });

    act(() => {
      result.current.invalidate('path-a');
    });

    await act(async () => {
      await result.current.get('path-a', buscarA);
      await result.current.get('path-b', buscarB);
    });

    expect(buscarA).toHaveBeenCalledTimes(2);
    expect(buscarB).toHaveBeenCalledTimes(1);
  });

  // Todos os outros testes passam um cacheTime explícito, então o valor padrão
  // — que é o usado em produção — nunca era exercido.
  it('usa cinco minutos de cache quando nenhum tempo é informado', async () => {
    const { result } = renderHook(() => useFirestoreCache<string>());
    const buscar = jest.fn().mockResolvedValue('v');

    await act(async () => {
      await result.current.get('path', buscar);
    });

    jest.advanceTimersByTime(4 * 60 * 1000);
    await act(async () => {
      await result.current.get('path', buscar);
    });
    expect(buscar).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2 * 60 * 1000);
    await act(async () => {
      await result.current.get('path', buscar);
    });
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('permite limpar todo o cache com clear()', async () => {
    const { result } = renderHook(() => useFirestoreCache<string>(5000));
    const fetcherA = jest.fn().mockResolvedValue('a');
    const fetcherB = jest.fn().mockResolvedValue('b');

    await act(async () => {
      await result.current.get('k1', fetcherA);
      await result.current.get('k2', fetcherB);
    });

    act(() => {
      result.current.clear();
    });

    await act(async () => {
      await result.current.get('k1', fetcherA);
      await result.current.get('k2', fetcherB);
    });

    expect(fetcherA).toHaveBeenCalledTimes(2);
    expect(fetcherB).toHaveBeenCalledTimes(2);
  });
});

describe('useCustomerName', () => {
  beforeEach(() => {
    mockDoc.mockReset();
    mockGetDoc.mockReset();
  });

  it('busca o nome do cliente no Firestore e formata o nome completo', async () => {
    mockDoc.mockReturnValue('DOC_REF_USER');
    mockGetDoc.mockResolvedValueOnce({
      data: () => ({ firstName: 'João', lastName: 'Silva' }),
    });

    const { result } = renderHook(() => useCustomerName());

    let name: string | undefined;
    await act(async () => {
      name = await result.current.fetchCustomerName('user-100');
    });

    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', 'user-100');
    expect(name).toBe('João Silva');
  });

  it('retorna "Cliente" quando o documento não possui campos de nome ou em caso de erro', async () => {
    mockDoc.mockReturnValue('DOC_REF_USER');
    mockGetDoc.mockResolvedValueOnce({
      data: () => ({}),
    });

    const { result } = renderHook(() => useCustomerName());

    let name1: string | undefined;
    await act(async () => {
      name1 = await result.current.fetchCustomerName('user-empty');
    });
    expect(name1).toBe('Cliente');

    mockGetDoc.mockRejectedValueOnce(new Error('Erro de permissão'));

    let name2: string | undefined;
    await act(async () => {
      name2 = await result.current.fetchCustomerName('user-err');
    });
    expect(name2).toBe('Cliente');
  });
});
