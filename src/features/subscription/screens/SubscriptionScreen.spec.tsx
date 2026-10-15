const mockShowError = jest.fn();
jest.mock('@shared/components/FeedbackProvider', () => ({
  useFeedback: () => ({ showError: mockShowError }),
}));

const mockShopApi = {
  shop: { id: 'shop-1', name: 'Estética Jorge' } as { id?: string; name?: string } | null,
  trialDaysLeft: 0,
  isInGrace: false,
};
// 9 de propósito, diferente do valor real (5): a tela escreve esse número no
// aviso de carência, e com o número real o teste passaria mesmo se a tela
// tivesse escrito "5" na mão em vez de usar a constante.
jest.mock('@features/shops', () => ({ useShop: () => mockShopApi, GRACE_DAYS: 9 }));

const mockSignOut = jest.fn();
jest.mock('@features/auth', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

const mockCreateCheckoutLink = jest.fn();
jest.mock('../services/checkout.service', () => ({
  createCheckoutLink: (...args: unknown[]) => mockCreateCheckoutLink(...args),
}));

import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import SubscriptionScreen from './SubscriptionScreen';

const LINK = 'https://sandbox.asaas.com/c/abc123';

/** Promessa que o teste resolve na mão, para inspecionar o estado "carregando". */
function promessaPendurada<T>() {
  let resolver: (v: T) => void = () => {};
  const promessa = new Promise<T>(r => {
    resolver = r;
  });
  return { promessa, resolver };
}

describe('SubscriptionScreen', () => {
  let abrirUrl: jest.SpyInstance;
  let podeAbrirUrl: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShopApi.shop = { id: 'shop-1', name: 'Estética Jorge' };
    mockShopApi.trialDaysLeft = 0;
    mockShopApi.isInGrace = false;
    mockCreateCheckoutLink.mockResolvedValue(LINK);
    abrirUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    podeAbrirUrl = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  });

  afterEach(() => {
    abrirUrl.mockRestore();
    podeAbrirUrl.mockRestore();
  });

  describe('estado do trial', () => {
    it('mostra os dias restantes enquanto o trial vale', () => {
      mockShopApi.trialDaysLeft = 3;

      render(<SubscriptionScreen />);

      expect(screen.getByText('Trial: 3 dias')).toBeTruthy();
      expect(screen.getByText('Continue no Pro')).toBeTruthy();
    });

    it('mostra trial expirado quando não resta nenhum dia', () => {
      mockShopApi.trialDaysLeft = 0;

      render(<SubscriptionScreen />);

      expect(screen.getByText('Trial expirado')).toBeTruthy();
      expect(screen.getByText('Ative seu plano')).toBeTruthy();
    });

    // Dia negativo acontece: o trial venceu há uma semana e a conta ficou
    // parada. Tratar como ativo mostraria "Trial: -7 dias".
    it('trata dias negativos como trial expirado', () => {
      mockShopApi.trialDaysLeft = -7;

      render(<SubscriptionScreen />);

      expect(screen.getByText('Trial expirado')).toBeTruthy();
    });
  });

  describe('carência', () => {
    it('avisa do pagamento pendente citando os dias de carência', () => {
      mockShopApi.isInGrace = true;

      render(<SubscriptionScreen />);

      expect(screen.getByText('Pagamento pendente')).toBeTruthy();
      expect(screen.getByText(/liberado por 9 dias/)).toBeTruthy();
    });

    it('não mostra o aviso fora da carência', () => {
      mockShopApi.isInGrace = false;

      render(<SubscriptionScreen />);

      expect(screen.queryByText('Pagamento pendente')).toBeNull();
    });
  });

  describe('checkout', () => {
    it('abre o checkout de cartão com o id da loja', async () => {
      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByTestId('assinar-cartao'));

      await waitFor(() => expect(abrirUrl).toHaveBeenCalledWith(LINK));
      expect(mockCreateCheckoutLink).toHaveBeenCalledWith('shop-1', 'card');
    });

    // Cartão e Pix não cabem no mesmo checkout do Asaas: recorrência só existe
    // no cartão. Trocar o método aqui cobra a coisa errada.
    it('abre o checkout de Pix com o método pix', async () => {
      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByTestId('assinar-pix'));

      await waitFor(() => expect(abrirUrl).toHaveBeenCalledWith(LINK));
      expect(mockCreateCheckoutLink).toHaveBeenCalledWith('shop-1', 'pix');
    });

    it('não tenta cobrar quando a loja ainda não tem id', () => {
      mockShopApi.shop = { name: 'Estética Jorge' };

      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByTestId('assinar-cartao'));

      expect(mockCreateCheckoutLink).not.toHaveBeenCalled();
    });

    // Dois toques tinham que gerar uma cobrança, não duas.
    it('bloqueia o segundo toque enquanto o checkout está carregando', async () => {
      const { promessa, resolver } = promessaPendurada<string>();
      mockCreateCheckoutLink.mockReturnValue(promessa);

      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByTestId('assinar-cartao'));
      fireEvent.press(screen.getByTestId('assinar-pix'));
      fireEvent.press(screen.getByTestId('assinar-cartao'));

      expect(mockCreateCheckoutLink).toHaveBeenCalledTimes(1);

      resolver(LINK);
      await waitFor(() => expect(abrirUrl).toHaveBeenCalledTimes(1));
    });

    it('libera os botões de novo depois que o checkout abre', async () => {
      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByTestId('assinar-cartao'));
      await waitFor(() => expect(abrirUrl).toHaveBeenCalledTimes(1));

      fireEvent.press(screen.getByTestId('assinar-pix'));

      await waitFor(() => expect(mockCreateCheckoutLink).toHaveBeenCalledTimes(2));
      expect(mockCreateCheckoutLink).toHaveBeenLastCalledWith('shop-1', 'pix');
    });

    it('mostra o motivo que o serviço devolve quando a cobrança falha', async () => {
      mockCreateCheckoutLink.mockRejectedValue(new Error('Assinatura já ativa.'));

      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByTestId('assinar-cartao'));

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Assinatura já ativa.'));
      expect(abrirUrl).not.toHaveBeenCalled();
    });

    it('mostra recado genérico quando a falha não tem mensagem', async () => {
      mockCreateCheckoutLink.mockRejectedValue(undefined);

      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByTestId('assinar-cartao'));

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith(
          'Não foi possível iniciar o pagamento. Tente novamente.',
        ),
      );
    });

    // `?? ` deixa passar mensagem vazia, e o dono recebe um toast em branco na
    // tela de pagamento sem saber o que fazer.
    it('mostra recado genérico quando a mensagem do erro vem vazia', async () => {
      mockCreateCheckoutLink.mockRejectedValue(new Error(''));

      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByTestId('assinar-cartao'));

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith(
          'Não foi possível iniciar o pagamento. Tente novamente.',
        ),
      );
    });

    it('libera os botões depois de uma falha', async () => {
      mockCreateCheckoutLink.mockRejectedValueOnce(new Error('Asaas fora do ar.'));

      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByTestId('assinar-cartao'));
      await waitFor(() => expect(mockShowError).toHaveBeenCalled());

      fireEvent.press(screen.getByTestId('assinar-cartao'));

      await waitFor(() => expect(mockCreateCheckoutLink).toHaveBeenCalledTimes(2));
    });
  });

  describe('suporte no WhatsApp', () => {
    it('abre a conversa com o número e os dados da loja', async () => {
      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByText('Suporte WhatsApp'));

      await waitFor(() => expect(abrirUrl).toHaveBeenCalled());
      const url = abrirUrl.mock.calls[0][0] as string;
      expect(url).toContain('whatsapp://send?phone=5511996784399');
      // O id vai no texto porque é com ele que a ativação é conferida na mão.
      expect(decodeURIComponent(url)).toContain('shop-1');
      expect(decodeURIComponent(url)).toContain('Estética Jorge');
    });

    it('mostra o número quando o WhatsApp não está instalado', async () => {
      podeAbrirUrl.mockResolvedValue(false);

      render(<SubscriptionScreen />);

      fireEvent.press(screen.getByText('Suporte WhatsApp'));

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Entre em contato: 5511996784399', {
          title: 'WhatsApp não encontrado',
        }),
      );
      expect(abrirUrl).not.toHaveBeenCalled();
    });
  });

  // O preço sai duas vezes: no topo e dentro do botão do cartão. As duas vêm da
  // mesma constante, então divergirem significa que alguém escreveu uma na mão.
  it('mostra o mesmo preço no topo e no botão do cartão', () => {
    render(<SubscriptionScreen />);

    expect(screen.getAllByText('R$ 89,00')).toHaveLength(2);
    expect(screen.getByText('/mês')).toBeTruthy();
  });

  it('sai da conta pelo botão do topo', () => {
    render(<SubscriptionScreen />);

    fireEvent.press(screen.getByTestId('sair'));

    expect(mockSignOut).toHaveBeenCalled();
  });
});
