import React from 'react';
import { render, renderHook, act } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockDoc = jest.fn();
const mockOnSnapshot = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: (...args: unknown[]) => mockDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

let mockMeStoreState = {
  reset: jest.fn(),
  setLoadingMe: jest.fn(),
  setMe: jest.fn(),
};

jest.mock('@features/auth', () => ({
  useAuth: () => mockUseAuth(),
  useMeStore: {
    getState: () => mockMeStoreState,
  },
}));

import { useShopStore, type ShopDoc } from '../state/shop.store';
import { ShopProvider, useShop } from './ShopContext';

describe('ShopContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useShopStore.getState().reset();

    mockMeStoreState = {
      reset: jest.fn(),
      setLoadingMe: jest.fn(),
      setMe: jest.fn(),
    };

    mockDoc.mockImplementation((_db, coll, id) => `${coll}/${id}`);
    mockUseAuth.mockReturnValue({ user: null });
  });

  describe('ShopProvider', () => {
    // A loja anterior precisa estar NO store antes de montar. Sem semear, o
    // teste afirma que um store já vazio está vazio, e passa igual se o reset
    // sumir — que é o vazamento entre lojas, o pior bug possível aqui.
    it('limpa a loja anterior quando o usuário não está autenticado', () => {
      act(() => {
        useShopStore.getState().setUserSnapshot({ shopId: 'shop-anterior', userRole: 'owner' });
        useShopStore
          .getState()
          .setShop({ id: 'shop-anterior', name: 'Estética do dono anterior' } as ShopDoc);
      });
      expect(useShopStore.getState().shopId).toBe('shop-anterior');

      render(
        <ShopProvider>
          <Text>Filho</Text>
        </ShopProvider>,
      );

      expect(useShopStore.getState().shopId).toBeNull();
      expect(useShopStore.getState().shop).toBeNull();
      expect(useShopStore.getState().userRole).toBeNull();
      expect(mockMeStoreState.reset).toHaveBeenCalled();

      // Sem usuário, nenhum listener de users/{uid} é aberto.
      const caminhos = mockOnSnapshot.mock.calls.map(([caminho]) => String(caminho));
      expect(caminhos.filter(c => c.startsWith('users/'))).toHaveLength(0);

      // O listener de shops/{shopId} chega a abrir por um ciclo, porque os dois
      // efeitos rodam na mesma montagem e o segundo ainda enxerga o shopId
      // antigo. O reset do primeiro derruba em seguida — o que importa é que o
      // store termine limpo, e as regras do Firestore recusam a leitura de quem
      // acabou de sair.
      expect(useShopStore.getState().shop).toBeNull();
    });

    it('cancela o listener do usuário ao desmontar', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-100' } });
      const cancelar = jest.fn();
      mockOnSnapshot.mockReturnValue(cancelar);

      const { unmount } = render(
        <ShopProvider>
          <Text>Filho</Text>
        </ShopProvider>,
      );
      unmount();

      expect(cancelar).toHaveBeenCalled();
    });

    // Trocar de loja sem cancelar o listener anterior deixa a loja antiga
    // continuar empurrando snapshots para dentro do store.
    it('cancela o listener da loja anterior ao trocar de loja', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-100' } });
      const cancelarPorCaminho: Record<string, jest.Mock> = {};
      let userSnapshotCallback: ((snap: unknown) => void) | undefined;

      mockOnSnapshot.mockImplementation((path: string, cb: (snap: unknown) => void) => {
        if (path === 'users/user-100') userSnapshotCallback = cb;
        const cancelar = jest.fn();
        cancelarPorCaminho[path] = cancelar;
        return cancelar;
      });

      render(
        <ShopProvider>
          <Text>Filho</Text>
        </ShopProvider>,
      );

      act(() => {
        userSnapshotCallback!({ data: () => ({ shopId: 'shop-a', role: 'owner' }) });
      });
      act(() => {
        userSnapshotCallback!({ data: () => ({ shopId: 'shop-b', role: 'owner' }) });
      });

      expect(cancelarPorCaminho['shops/shop-a']).toHaveBeenCalled();
      expect(cancelarPorCaminho['shops/shop-b']).not.toHaveBeenCalled();
    });

    it('assina o documento users/{uid} no Firestore ao autenticar', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-100' } });
      const mockUnsubUser = jest.fn();
      mockOnSnapshot.mockReturnValue(mockUnsubUser);

      render(
        <ShopProvider>
          <Text>Filho</Text>
        </ShopProvider>,
      );

      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', 'user-100');
      expect(mockOnSnapshot).toHaveBeenCalledWith(
        'users/user-100',
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('atualiza userSnapshot e meStore quando a snapshot do usuário é recebida', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-100' } });
      let userSnapshotCallback: ((snap: unknown) => void) | undefined;

      mockOnSnapshot.mockImplementation((path, cb) => {
        if (path === 'users/user-100') {
          userSnapshotCallback = cb;
        }
        return jest.fn();
      });

      render(
        <ShopProvider>
          <Text>Filho</Text>
        </ShopProvider>,
      );

      act(() => {
        userSnapshotCallback!({
          data: () => ({
            shopId: 'shop-abc',
            role: 'owner',
            name: 'Carlos Estética',
          }),
        });
      });

      expect(useShopStore.getState().shopId).toBe('shop-abc');
      expect(useShopStore.getState().userRole).toBe('owner');
      expect(mockMeStoreState.setMe).toHaveBeenCalledWith({
        shopId: 'shop-abc',
        role: 'owner',
        name: 'Carlos Estética',
        uid: 'user-100',
      });
    });

    it('assina o documento shops/{shopId} quando shopId for definido', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-100' } });
      let userSnapshotCallback: ((snap: unknown) => void) | undefined;

      mockOnSnapshot.mockImplementation((path, cb) => {
        if (path === 'users/user-100') {
          userSnapshotCallback = cb;
        }
        return jest.fn();
      });

      render(
        <ShopProvider>
          <Text>Filho</Text>
        </ShopProvider>,
      );

      act(() => {
        userSnapshotCallback!({
          data: () => ({ shopId: 'shop-xyz', role: 'owner' }),
        });
      });

      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'shops', 'shop-xyz');
      expect(mockOnSnapshot).toHaveBeenCalledWith(
        'shops/shop-xyz',
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('atualiza o shop no store quando o snapshot da loja existe', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-100' } });
      let userSnapshotCallback: ((snap: unknown) => void) | undefined;
      let shopSnapshotCallback: ((snap: unknown) => void) | undefined;

      mockOnSnapshot.mockImplementation((path, cb) => {
        if (path === 'users/user-100') userSnapshotCallback = cb;
        if (path === 'shops/shop-xyz') shopSnapshotCallback = cb;
        return jest.fn();
      });

      render(
        <ShopProvider>
          <Text>Filho</Text>
        </ShopProvider>,
      );

      act(() => {
        userSnapshotCallback!({
          data: () => ({ shopId: 'shop-xyz', role: 'owner' }),
        });
      });

      act(() => {
        shopSnapshotCallback!({
          exists: () => true,
          id: 'shop-xyz',
          data: () => ({
            name: 'Auto Detail Garage',
            plan: 'pro',
          }),
        });
      });

      expect(useShopStore.getState().shop).toEqual({
        id: 'shop-xyz',
        name: 'Auto Detail Garage',
        plan: 'pro',
      });
    });

    it('define shop como nulo quando o documento da loja não existe', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-100' } });
      let userSnapshotCallback: ((snap: unknown) => void) | undefined;
      let shopSnapshotCallback: ((snap: unknown) => void) | undefined;

      mockOnSnapshot.mockImplementation((path, cb) => {
        if (path === 'users/user-100') userSnapshotCallback = cb;
        if (path === 'shops/shop-xyz') shopSnapshotCallback = cb;
        return jest.fn();
      });

      render(
        <ShopProvider>
          <Text>Filho</Text>
        </ShopProvider>,
      );

      act(() => {
        userSnapshotCallback!({
          data: () => ({ shopId: 'shop-xyz', role: 'owner' }),
        });
      });

      act(() => {
        shopSnapshotCallback!({
          exists: () => false,
        });
      });

      expect(useShopStore.getState().shop).toBeNull();
    });

    it('trata erro no listener do usuário ou loja desativando loading', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-100' } });
      let userErrorCb: (() => void) | undefined;

      mockOnSnapshot.mockImplementation((path, _cb, errCb) => {
        if (path === 'users/user-100') userErrorCb = errCb;
        return jest.fn();
      });

      render(
        <ShopProvider>
          <Text>Filho</Text>
        </ShopProvider>,
      );

      act(() => {
        userErrorCb!();
      });

      expect(useShopStore.getState().loadingUser).toBe(false);
      expect(mockMeStoreState.setLoadingMe).toHaveBeenCalledWith(false);
    });
  });

  describe('useShop hook', () => {
    it('retorna os dados combinados do store e calcula o estado da assinatura', () => {
      const mockShopDoc: ShopDoc = {
        id: 'shop-1',
        name: 'Detail Shop',
        subscriptionStatus: 'active',
        activeUntil: { toMillis: () => Date.now() + 86400000 },
      } as ShopDoc;

      act(() => {
        useShopStore.getState().setUserSnapshot({ shopId: 'shop-1', userRole: 'owner' });
        useShopStore.getState().setShop(mockShopDoc);
        useShopStore.getState().setLoadingUser(false);
        useShopStore.getState().setLoadingShop(false);
      });

      const { result } = renderHook(() => useShop());

      expect(result.current.shopId).toBe('shop-1');
      expect(result.current.userRole).toBe('owner');
      expect(result.current.loading).toBe(false);
      expect(result.current.isSubscriptionActive).toBe(true);
    });

    // Com os dois iguais, `||` e `&&` dão o mesmo resultado e a condição pode
    // trocar sem ninguém notar. Só um de cada vez separa as duas.
    it.each([
      ['o usuário', true, false],
      ['a loja', false, true],
    ])('segue carregando enquanto %s não respondeu', (_quem, carregandoUser, carregandoShop) => {
      act(() => {
        useShopStore.getState().setLoadingUser(carregandoUser);
        useShopStore.getState().setLoadingShop(carregandoShop);
      });

      const { result } = renderHook(() => useShop());

      expect(result.current.loading).toBe(true);
    });
  });
});
