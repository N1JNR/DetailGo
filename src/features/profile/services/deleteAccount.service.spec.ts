const mockGetIdToken = jest.fn();
const mockReautenticar = jest.fn();
const mockCredential = jest.fn((email: string, senha: string) => ({ email, senha }));

const mockUsuario = {
  email: 'jorge@detailgo.com' as string | null,
  getIdToken: mockGetIdToken,
  reauthenticateWithCredential: mockReautenticar,
};
const mockAuth = { currentUser: mockUsuario as typeof mockUsuario | null };

jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: { EmailAuthProvider: { credential: (...a: [string, string]) => mockCredential(...a) } },
  getAuth: () => mockAuth,
}));

import { requestAccountDeletion } from './deleteAccount.service';

const URL_ESPERADA = 'https://us-central1-magic-auto.cloudfunctions.net/deleteAccount';

function responder(status: number, corpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as Response;
}

const buscar = () => globalThis.fetch as jest.Mock;

describe('requestAccountDeletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.currentUser = mockUsuario;
    mockUsuario.email = 'jorge@detailgo.com';
    mockGetIdToken.mockResolvedValue('token-123');
    mockReautenticar.mockResolvedValue(undefined);
    globalThis.fetch = jest.fn().mockResolvedValue(responder(200, { excluida: true }));
  });

  describe('prova de identidade', () => {
    // O deleteUser do Admin SDK não pede login recente — isso só vale no
    // cliente. Sem reautenticar, um token vazado apagaria a conta.
    it('reautentica com a senha antes de pedir a exclusão', async () => {
      await requestAccountDeletion('senha123');

      expect(mockCredential).toHaveBeenCalledWith('jorge@detailgo.com', 'senha123');
      expect(mockReautenticar).toHaveBeenCalledWith({
        email: 'jorge@detailgo.com',
        senha: 'senha123',
      });
    });

    it('não chama a function quando a senha está errada', async () => {
      mockReautenticar.mockRejectedValue({ code: 'auth/wrong-password' });

      const r = await requestAccountDeletion('errada');

      expect(r).toEqual({ ok: false, message: 'Senha incorreta.' });
      expect(buscar()).not.toHaveBeenCalled();
    });

    it.each([
      ['auth/wrong-password', 'Senha incorreta.'],
      ['auth/invalid-credential', 'Senha incorreta.'],
      ['auth/too-many-requests', 'Muitas tentativas. Aguarde alguns minutos.'],
      ['auth/network-request-failed', 'Sem conexão. Tente de novo.'],
      ['auth/desconhecido', 'Não foi possível confirmar sua senha.'],
    ])('traduz %s', async (code, mensagem) => {
      mockReautenticar.mockRejectedValue({ code });

      expect(await requestAccountDeletion('x')).toEqual({ ok: false, message: mensagem });
    });

    // Token em cache não carrega o auth_time recente que o servidor exige.
    it('pede token novo depois de reautenticar', async () => {
      await requestAccountDeletion('senha123');

      expect(mockGetIdToken).toHaveBeenCalledWith(true);
    });

    it('recusa sem sessão, sem nem reautenticar', async () => {
      mockAuth.currentUser = null;

      const r = await requestAccountDeletion('senha123');

      expect(r).toEqual({ ok: false, message: 'Sessão expirada. Entre novamente.' });
      expect(mockReautenticar).not.toHaveBeenCalled();
      expect(buscar()).not.toHaveBeenCalled();
    });

    // Conta criada por provedor sem e-mail não tem como reautenticar por senha.
    it('recusa quando a conta não tem e-mail', async () => {
      mockUsuario.email = null;

      expect(await requestAccountDeletion('senha123')).toMatchObject({ ok: false });
      expect(mockReautenticar).not.toHaveBeenCalled();
    });
  });

  describe('chamada ao servidor', () => {
    it('manda o token no cabeçalho', async () => {
      await requestAccountDeletion('senha123');

      expect(buscar()).toHaveBeenCalledWith(
        URL_ESPERADA,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        }),
      );
    });

    it('devolve ok quando a exclusão acontece', async () => {
      await expect(requestAccountDeletion('senha123')).resolves.toEqual({ ok: true });
    });

    // 409 é o servidor dizendo o que resolver antes, não falha.
    it('devolve os impedimentos do 409', async () => {
      const impedimentos = [
        { codigo: 'assinatura_ativa', mensagem: 'Cancele a assinatura antes.' },
        { codigo: 'agendamentos_futuros', mensagem: 'Há 2 agendamentos futuros.' },
      ];
      buscar().mockResolvedValue(responder(409, { impedimentos }));

      expect(await requestAccountDeletion('senha123')).toEqual({ ok: false, impedimentos });
    });

    it('devolve lista vazia quando o 409 vem sem impedimentos', async () => {
      buscar().mockResolvedValue(responder(409, {}));

      expect(await requestAccountDeletion('senha123')).toEqual({ ok: false, impedimentos: [] });
    });

    it('devolve lista vazia quando o corpo do 409 não é JSON', async () => {
      buscar().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => {
          throw new Error('corpo vazio');
        },
      } as unknown as Response);

      expect(await requestAccountDeletion('senha123')).toEqual({ ok: false, impedimentos: [] });
    });

    it('repassa a mensagem de erro do servidor', async () => {
      buscar().mockResolvedValue(responder(500, { error: 'Falhou no servidor.' }));

      expect(await requestAccountDeletion('senha123')).toEqual({
        ok: false,
        message: 'Falhou no servidor.',
      });
    });

    // Mensagem vazia é tão inútil quanto ausente: `||` e não `??`.
    it('cai no recado genérico quando o erro vem vazio', async () => {
      buscar().mockResolvedValue(responder(500, { error: '' }));

      expect(await requestAccountDeletion('senha123')).toEqual({
        ok: false,
        message: 'Não foi possível excluir a conta agora.',
      });
    });

    it('cai no recado genérico quando o corpo do erro não é JSON', async () => {
      buscar().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('corpo vazio');
        },
      } as unknown as Response);

      expect(await requestAccountDeletion('senha123')).toMatchObject({
        message: 'Não foi possível excluir a conta agora.',
      });
    });

    it('não estoura quando a rede cai', async () => {
      buscar().mockRejectedValue(new Error('sem rede'));

      expect(await requestAccountDeletion('senha123')).toEqual({
        ok: false,
        message: 'Não foi possível excluir a conta agora.',
      });
    });

    it('não estoura quando o token falha', async () => {
      mockGetIdToken.mockRejectedValue(new Error('token'));

      expect(await requestAccountDeletion('senha123')).toMatchObject({ ok: false });
      expect(buscar()).not.toHaveBeenCalled();
    });
  });
});
