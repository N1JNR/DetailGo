const mockGetIdToken = jest.fn();
const mockUsuario = { getIdToken: mockGetIdToken } as { getIdToken: jest.Mock } | null;
const mockAuth = { currentUser: mockUsuario };
jest.mock('@react-native-firebase/auth', () => ({ getAuth: () => mockAuth }));

import { requestAccountDeletion } from './deleteAccount.service';

const URL_ESPERADA = 'https://us-central1-magic-auto.cloudfunctions.net/deleteAccount';

function responder(status: number, corpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as Response;
}

describe('requestAccountDeletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.currentUser = mockUsuario;
    mockGetIdToken.mockResolvedValue('token-123');
    global.fetch = jest.fn().mockResolvedValue(responder(200, { excluida: true }));
  });

  it('chama a function com o token no cabeçalho', async () => {
    await requestAccountDeletion();

    expect(global.fetch).toHaveBeenCalledWith(
      URL_ESPERADA,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
  });

  // Token em cache pode estar revogado, e a function confere revogação. Falhar
  // por token velho não é culpa de quem está pedindo.
  it('força token novo em vez de usar o do cache', async () => {
    await requestAccountDeletion();

    expect(mockGetIdToken).toHaveBeenCalledWith(true);
  });

  it('devolve ok quando a exclusão acontece', async () => {
    await expect(requestAccountDeletion()).resolves.toEqual({ ok: true });
  });

  it('recusa sem sessão, sem nem chamar a rede', async () => {
    mockAuth.currentUser = null;

    const r = await requestAccountDeletion();

    expect(r).toEqual({ ok: false, message: 'Sessão expirada. Entre novamente.' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // 409 é o servidor dizendo o que resolver antes, não falha. A tela mostra
  // isso como instrução, então os impedimentos têm que atravessar inteiros.
  it('devolve os impedimentos do 409', async () => {
    const impedimentos = [
      { codigo: 'assinatura_ativa', mensagem: 'Cancele a assinatura antes.' },
      { codigo: 'agendamentos_futuros', mensagem: 'Há 2 agendamentos futuros.' },
    ];
    (global.fetch as jest.Mock).mockResolvedValue(responder(409, { impedimentos }));

    const r = await requestAccountDeletion();

    expect(r).toEqual({ ok: false, impedimentos });
  });

  it('devolve lista vazia quando o 409 vem sem impedimentos', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(responder(409, {}));

    expect(await requestAccountDeletion()).toEqual({ ok: false, impedimentos: [] });
  });

  it('devolve lista vazia quando o corpo do 409 não é JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => {
        throw new Error('corpo vazio');
      },
    } as unknown as Response);

    expect(await requestAccountDeletion()).toEqual({ ok: false, impedimentos: [] });
  });

  it('repassa a mensagem de erro do servidor', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(responder(500, { error: 'Falhou no servidor.' }));

    expect(await requestAccountDeletion()).toEqual({
      ok: false,
      message: 'Falhou no servidor.',
    });
  });

  // Mensagem vazia é tão inútil quanto ausente: `||` e não `??`, senão o dono
  // leva um aviso em branco.
  it('cai no recado genérico quando o erro vem vazio', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(responder(500, { error: '' }));

    expect(await requestAccountDeletion()).toEqual({
      ok: false,
      message: 'Não foi possível excluir a conta agora.',
    });
  });

  it('cai no recado genérico quando o erro não traz mensagem', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(responder(503, {}));

    expect(await requestAccountDeletion()).toMatchObject({
      message: 'Não foi possível excluir a conta agora.',
    });
  });

  it('cai no recado genérico quando o corpo do erro não é JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('corpo vazio');
      },
    } as unknown as Response);

    expect(await requestAccountDeletion()).toEqual({
      ok: false,
      message: 'Não foi possível excluir a conta agora.',
    });
  });

  it('não estoura quando a rede cai', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('sem rede'));

    expect(await requestAccountDeletion()).toEqual({
      ok: false,
      message: 'Não foi possível excluir a conta agora.',
    });
  });

  it('não estoura quando o token falha', async () => {
    mockGetIdToken.mockRejectedValue(new Error('token'));

    expect(await requestAccountDeletion()).toMatchObject({ ok: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
