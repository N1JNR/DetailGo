const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockParams = { shopId: 'shop-1' };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
  useRoute: () => ({ params: mockParams }),
}));

const mockGetDoc = jest.fn();
jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_db: unknown, ...caminho: string[]) => caminho.join('/'),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

const mockUseShopServices = jest.fn();
// `getServiceVehicleSummary` e `getShopServiceIcon` têm teste próprio; aqui o
// que importa é a tela chamar e mostrar o que eles devolvem.
jest.mock('@features/shops', () => ({
  useShopServices: (...args: unknown[]) => mockUseShopServices(...args),
  getServiceVehicleSummary: (s: { id: string }) => `veículos de ${s.id}`,
  getShopServiceIcon: () => () => null,
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import ShopProfileScreen from './ShopProfileScreen';

const snap = (dados: Record<string, unknown> | null, id = 'shop-1') => ({
  exists: () => dados !== null,
  id,
  data: () => dados,
});

const LOJA = {
  name: 'Estética do Jorge',
  location: { address: 'Rua das Flores, 100', city: 'São Paulo' },
};

const servico = (over: Record<string, unknown> = {}) => ({
  id: 'svc-1',
  name: 'Lavagem completa',
  description: 'Interna e externa',
  price: 80,
  ...over,
});

/** Resolve as duas leituras: o doc da loja e o de settings. */
function responder(loja: unknown, settings: unknown) {
  mockGetDoc.mockImplementation((caminho: string) =>
    Promise.resolve(caminho.includes('settings') ? settings : loja),
  );
}

async function renderizar() {
  const r = render(<ShopProfileScreen />);
  await waitFor(() => expect(screen.queryByText('Detalhes da estética')).toBeTruthy());
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.shopId = 'shop-1';
  responder(snap(LOJA), snap({ openHour: 8, closeHour: 18 }));
  mockUseShopServices.mockReturnValue({ items: [servico()], loading: false });
});

describe('ShopProfileScreen — carregamento', () => {
  it('segura a tela no spinner enquanto a loja não chegou', () => {
    mockGetDoc.mockReturnValue(new Promise(() => {}));

    render(<ShopProfileScreen />);

    expect(screen.queryByText('Detalhes da estética')).toBeNull();
  });

  // Loja inexistente nunca preenche o estado, então a tela fica no spinner em
  // vez de mostrar um perfil vazio com botão de agendar.
  it('não mostra o perfil quando a loja não existe', async () => {
    responder(snap(null), snap({ openHour: 8, closeHour: 18 }));

    render(<ShopProfileScreen />);

    await waitFor(() => expect(mockGetDoc).toHaveBeenCalled());
    expect(screen.queryByText('Detalhes da estética')).toBeNull();
  });

  it('lê o documento da loja e o de configurações', async () => {
    await renderizar();

    expect(mockGetDoc).toHaveBeenCalledWith('shops/shop-1');
    expect(mockGetDoc).toHaveBeenCalledWith('shops/shop-1/settings/config');
  });

  it('pede só os serviços ativos da loja da rota', async () => {
    mockParams.shopId = 'shop-9';
    await renderizar();

    expect(mockUseShopServices).toHaveBeenCalledWith({ shopId: 'shop-9', activeOnly: true });
  });
});

describe('ShopProfileScreen — dados da loja', () => {
  it('mostra o nome', async () => {
    await renderizar();

    expect(screen.getByText('Estética do Jorge')).toBeTruthy();
  });

  it('mostra endereço com cidade', async () => {
    await renderizar();

    expect(screen.getByText('Rua das Flores, 100 - São Paulo')).toBeTruthy();
  });

  it('mostra o endereço sem o traço quando não há cidade', async () => {
    responder(
      snap({ ...LOJA, location: { address: 'Rua das Flores, 100' } }),
      snap({ openHour: 8, closeHour: 18 }),
    );

    await renderizar();

    expect(screen.getByText('Rua das Flores, 100')).toBeTruthy();
  });

  it('omite a linha de endereço quando a loja não tem localização', async () => {
    responder(snap({ name: 'Sem endereço' }), snap({ openHour: 8, closeHour: 18 }));

    await renderizar();

    expect(screen.getByText('Sem endereço')).toBeTruthy();
    expect(screen.queryByText(/Rua/)).toBeNull();
  });
});

describe('ShopProfileScreen — horário', () => {
  it('mostra o horário configurado', async () => {
    responder(snap(LOJA), snap({ openHour: 9, closeHour: 19 }));

    await renderizar();

    expect(screen.getByText(/09h as 19h/)).toBeTruthy();
  });

  // Uma hora sozinha viraria "8h as 18h" e desalinha a leitura.
  it('completa a hora com zero à esquerda', async () => {
    responder(snap(LOJA), snap({ openHour: 7, closeHour: 9 }));

    await renderizar();

    expect(screen.getByText(/07h as 09h/)).toBeTruthy();
  });

  it('usa 8 às 18 quando a loja não tem configurações', async () => {
    responder(snap(LOJA), snap(null));

    await renderizar();

    expect(screen.getByText(/08h as 18h/)).toBeTruthy();
  });

  it('completa só o campo faltante quando as configurações vêm pela metade', async () => {
    responder(snap(LOJA), snap({ closeHour: 20 }));

    await renderizar();

    expect(screen.getByText(/08h as 20h/)).toBeTruthy();
  });
});

describe('ShopProfileScreen — serviços', () => {
  it('mostra o spinner enquanto os serviços carregam', async () => {
    mockUseShopServices.mockReturnValue({ items: [], loading: true });

    await renderizar();

    expect(screen.queryByText('Esta estética ainda não cadastrou serviços.')).toBeNull();
  });

  it('avisa quando a loja não cadastrou serviço nenhum', async () => {
    mockUseShopServices.mockReturnValue({ items: [], loading: false });

    await renderizar();

    expect(screen.getByText('Esta estética ainda não cadastrou serviços.')).toBeTruthy();
  });

  it('não mostra a contagem quando não há serviços', async () => {
    mockUseShopServices.mockReturnValue({ items: [], loading: false });

    await renderizar();

    expect(screen.getByText('Serviços oferecidos')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('mostra a contagem de serviços', async () => {
    mockUseShopServices.mockReturnValue({
      items: [servico(), servico({ id: 'svc-2' }), servico({ id: 'svc-3' })],
      loading: false,
    });

    await renderizar();

    expect(screen.getByText('3')).toBeTruthy();
  });

  it('mostra nome, descrição e resumo de veículos de cada serviço', async () => {
    await renderizar();

    expect(screen.getByText('Lavagem completa')).toBeTruthy();
    expect(screen.getByText('Interna e externa')).toBeTruthy();
    expect(screen.getByText('veículos de svc-1')).toBeTruthy();
  });

  it('omite a descrição quando o serviço não tem uma', async () => {
    mockUseShopServices.mockReturnValue({
      items: [servico({ description: '' })],
      loading: false,
    });

    await renderizar();

    expect(screen.getByText('Lavagem completa')).toBeTruthy();
    expect(screen.queryByText('Interna e externa')).toBeNull();
  });

  // Serviço sem preço é "sob consulta": mostrar R$ 0,00 faria o cliente achar
  // que é de graça.
  it('omite o preço quando o serviço não tem um', async () => {
    mockUseShopServices.mockReturnValue({
      items: [servico({ price: undefined })],
      loading: false,
    });

    await renderizar();

    expect(screen.queryByText(/R\$/)).toBeNull();
  });

  it('mostra o preço quando existe', async () => {
    await renderizar();

    expect(screen.getByText(/R\$/)).toBeTruthy();
  });

  it('mostra preço zero em vez de esconder', async () => {
    mockUseShopServices.mockReturnValue({ items: [servico({ price: 0 })], loading: false });

    await renderizar();

    expect(screen.getByText(/R\$/)).toBeTruthy();
  });
});

describe('ShopProfileScreen — navegação', () => {
  it('volta pela seta', async () => {
    await renderizar();

    fireEvent.press(screen.getByTestId('voltar'));

    expect(mockGoBack).toHaveBeenCalled();
  });

  it('leva para o agendamento da loja que está aberta', async () => {
    mockParams.shopId = 'shop-7';
    await renderizar();

    fireEvent.press(screen.getByText('Agendar serviço aqui'));

    expect(mockNavigate).toHaveBeenCalledWith('Appointment', { shopId: 'shop-7' });
  });
});
