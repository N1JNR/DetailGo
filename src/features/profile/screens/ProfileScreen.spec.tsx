const mockBanco = {};
const mockUpdateDoc = jest.fn();
// Sentinela: a tela usa deleteField() para APAGAR o pendingEmail, e gravar
// string vazia no lugar deixaria o campo existindo no documento.
const mockApagarCampo = { __deleteField: true };
jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => mockBanco,
  doc: jest.fn((_db: unknown, ...caminho: string[]) => ({ path: caminho.join('/') })),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteField: () => mockApagarCampo,
}));

const mockReload = jest.fn();
const mockReautenticar = jest.fn();
const mockVerifyBeforeUpdateEmail = jest.fn();
const mockBuscarMetodos = jest.fn();
const mockEnviarResetSenha = jest.fn();
const mockAuthSignOut = jest.fn();
const mockCredential = jest.fn((email: string, senha: string) => ({ email, senha }));

const mockUsuario = {
  uid: 'user-1',
  email: 'jorge@antigo.com' as string | null,
  displayName: null as string | null,
  photoURL: null as string | null,
  reload: mockReload,
  reauthenticateWithCredential: mockReautenticar,
  verifyBeforeUpdateEmail: mockVerifyBeforeUpdateEmail,
};
const mockInstanciaAuth = {
  currentUser: mockUsuario as typeof mockUsuario | null,
  fetchSignInMethodsForEmail: mockBuscarMetodos,
  sendPasswordResetEmail: mockEnviarResetSenha,
  signOut: mockAuthSignOut,
};
// A tela importa os dois jeitos: `getAuth()` para a instância e o default só
// para o `EmailAuthProvider.credential`.
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: { EmailAuthProvider: { credential: (...a: [string, string]) => mockCredential(...a) } },
  getAuth: () => mockInstanciaAuth,
}));

const mockEscolherImagem = jest.fn();
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: (...a: unknown[]) => mockEscolherImagem(...a),
}));

const mockEnviarFoto = jest.fn();
jest.mock('@shared/services/userPhoto.service', () => ({
  uploadProfilePhoto: (...a: unknown[]) => mockEnviarFoto(...a),
}));

const mockSignOut = jest.fn();
let mockMeAtual: Record<string, unknown> | null = null;
jest.mock('@features/auth', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
  useMeStore: (seletor: (s: { me: unknown }) => unknown) => seletor({ me: mockMeAtual }),
}));

type OpcoesSucesso = { title?: string; primaryLabel?: string; onClose?: () => void };
type Confirmacao = {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};
const mockShowError = jest.fn();
let ultimoSucesso: { message: string; options?: OpcoesSucesso } | null = null;
let ultimaConfirmacao: Confirmacao | null = null;
const mockFeedback = {
  showError: mockShowError,
  showSuccess: jest.fn((message: string, options?: OpcoesSucesso) => {
    ultimoSucesso = { message, options };
  }),
  showConfirm: jest.fn((options: Confirmacao) => {
    ultimaConfirmacao = options;
  }),
};
jest.mock('@shared/components/FeedbackProvider', () => ({ useFeedback: () => mockFeedback }));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}));

// O modal de sucesso vira um bloco simples: o que interessa é a tela decidir
// mostrá-lo e com que texto, não o visual do componente compartilhado.
jest.mock('@shared/components/SuccessModal', () => {
  const ReactLocal = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      visible,
      title,
      message,
      onPrimary,
    }: {
      visible: boolean;
      title: string;
      message: string;
      onPrimary: () => void;
    }) =>
      visible
        ? ReactLocal.createElement(
            View,
            { testID: 'modal-sucesso' },
            ReactLocal.createElement(Text, null, title),
            ReactLocal.createElement(Text, null, message),
            ReactLocal.createElement(TouchableOpacity, { testID: 'modal-ok', onPress: onPrimary }),
          )
        : null,
  };
});

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

import ProfileScreen from './ProfileScreen';

const ME_PADRAO = {
  firstName: 'Jorge',
  lastName: 'Ribeiro',
  phone: '11996784399',
  email: 'jorge@antigo.com',
};

function renderizar() {
  return render(<ProfileScreen />);
}

/** Dispara o onClose do último showSuccess, que é onde a tela fecha/desloga. */
async function fecharSucesso() {
  await act(async () => {
    ultimoSucesso?.options?.onClose?.();
  });
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ultimoSucesso = null;
    ultimaConfirmacao = null;
    mockMeAtual = { ...ME_PADRAO };
    mockUsuario.uid = 'user-1';
    mockUsuario.email = 'jorge@antigo.com';
    mockUsuario.displayName = null;
    mockUsuario.photoURL = null;
    mockInstanciaAuth.currentUser = mockUsuario;
    mockUpdateDoc.mockResolvedValue(undefined);
    mockReload.mockResolvedValue(undefined);
    mockReautenticar.mockResolvedValue(undefined);
    mockVerifyBeforeUpdateEmail.mockResolvedValue(undefined);
    mockBuscarMetodos.mockResolvedValue([]);
    mockEnviarResetSenha.mockResolvedValue(undefined);
    mockEnviarFoto.mockResolvedValue({ ok: true, url: 'https://cdn/nova.jpg' });
  });

  describe('carregamento', () => {
    it('segura a tela no spinner enquanto o perfil não chegou', () => {
      mockMeAtual = null;

      renderizar();

      expect(screen.queryByText('Perfil')).toBeNull();
      expect(screen.queryByText('Dados pessoais')).toBeNull();
    });

    // Sem usuário o listener nunca entrega nada, e esperar por ele deixaria a
    // tela girando para sempre.
    it('sai do spinner mesmo sem usuário logado', () => {
      mockInstanciaAuth.currentUser = null;
      mockMeAtual = null;

      renderizar();

      expect(screen.getByText('Perfil')).toBeTruthy();
    });
  });

  describe('exibição', () => {
    // O nome sai duas vezes: no topo e na linha "Nome" dos dados pessoais. As
    // duas vêm do mesmo `displayName`, então divergirem é erro.
    it('mostra nome completo e telefone com máscara', () => {
      renderizar();

      expect(screen.getAllByText('Jorge Ribeiro')).toHaveLength(2);
      expect(screen.getByText('(11) 99678-4399')).toBeTruthy();
    });

    it('usa o displayName do auth quando o Firestore não tem nome', () => {
      mockMeAtual = { phone: '' };
      mockUsuario.displayName = 'Jorge do Auth';

      renderizar();

      expect(screen.getAllByText('Jorge do Auth')).toHaveLength(2);
    });

    it('cai no nome genérico quando não há nome em lugar nenhum', () => {
      mockMeAtual = { phone: '' };

      renderizar();

      expect(screen.getAllByText('Usuário DetailGo')).toHaveLength(2);
    });

    it('mostra as iniciais do nome quando não há foto', () => {
      renderizar();

      expect(screen.getByText('JR')).toBeTruthy();
      expect(screen.queryByTestId('avatar')).toBeNull();
    });

    it('mostra "Não informado" quando não há telefone', () => {
      mockMeAtual = { ...ME_PADRAO, phone: '' };

      renderizar();

      expect(screen.getByText('Não informado')).toBeTruthy();
    });

    // A foto do Storage tem que ganhar do base64 legado: as duas podem coexistir
    // no documento, e mostrar a antiga desfaz a troca que o dono acabou de fazer.
    it('prefere a foto do Storage ao base64 legado', () => {
      mockMeAtual = {
        ...ME_PADRAO,
        photoURL: 'https://cdn/nova.jpg',
        photoB64: 'data:image/png;base64,AAA',
      };

      renderizar();

      expect(screen.getByTestId('avatar').props.source).toEqual({ uri: 'https://cdn/nova.jpg' });
    });

    it('usa o base64 legado quando não existe foto no Storage', () => {
      mockMeAtual = { ...ME_PADRAO, photoB64: 'data:image/png;base64,AAA' };

      renderizar();

      expect(screen.getByTestId('avatar').props.source).toEqual({
        uri: 'data:image/png;base64,AAA',
      });
    });

    it('volta pela seta', () => {
      renderizar();

      fireEvent.press(screen.getByTestId('voltar'));

      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  describe('e-mail pendente de confirmação', () => {
    it('mostra o aviso com o e-mail que falta confirmar', () => {
      mockMeAtual = { ...ME_PADRAO, pendingEmail: 'novo@email.com' };

      renderizar();

      expect(screen.getByText('Confirmação pendente')).toBeTruthy();
      expect(screen.getByText('novo@email.com')).toBeTruthy();
    });

    // Quando o dono já clicou no link, o auth passa a devolver o novo e-mail e o
    // pendente virou histórico. Continuar mostrando o aviso faria ele clicar de
    // novo num link que já foi usado.
    it('esconde o aviso quando o auth já está com o e-mail novo', () => {
      mockUsuario.email = 'novo@email.com';
      mockMeAtual = { ...ME_PADRAO, pendingEmail: 'novo@email.com' };

      renderizar();

      expect(screen.queryByText('Confirmação pendente')).toBeNull();
    });

    it('compara ignorando maiúsculas e espaços', () => {
      mockUsuario.email = 'novo@email.com';
      mockMeAtual = { ...ME_PADRAO, pendingEmail: '  NOVO@Email.COM ' };

      renderizar();

      expect(screen.queryByText('Confirmação pendente')).toBeNull();
    });
  });

  describe('nome', () => {
    function abrirEdicaoDeNome() {
      renderizar();
      fireEvent.press(screen.getByText('Nome'));
    }

    it('exige o nome', () => {
      abrirEdicaoDeNome();

      fireEvent.changeText(screen.getByPlaceholderText('Seu nome'), '   ');
      fireEvent.press(screen.getByText('Salvar'));

      expect(mockShowError).toHaveBeenCalledWith('Nome e sobrenome são obrigatórios', {
        title: 'Atenção',
      });
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    // Os dois campos precisam de teste separado: com um só, metade da condição
    // pode cair sem nada quebrar.
    it('exige o sobrenome', () => {
      abrirEdicaoDeNome();

      fireEvent.changeText(screen.getByPlaceholderText('Seu sobrenome'), '   ');
      fireEvent.press(screen.getByText('Salvar'));

      expect(mockShowError).toHaveBeenCalledWith('Nome e sobrenome são obrigatórios', {
        title: 'Atenção',
      });
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('salva nome e sobrenome sem os espaços das pontas', async () => {
      abrirEdicaoDeNome();

      fireEvent.changeText(screen.getByPlaceholderText('Seu nome'), '  Jorge  ');
      fireEvent.changeText(screen.getByPlaceholderText('Seu sobrenome'), ' Ribeiro ');
      fireEvent.press(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          { path: 'users/user-1' },
          { firstName: 'Jorge', lastName: 'Ribeiro' },
        ),
      );
    });

    it('confirma com o modal e fecha a edição', async () => {
      abrirEdicaoDeNome();

      fireEvent.press(screen.getByText('Salvar'));

      expect(await screen.findByTestId('modal-sucesso')).toBeTruthy();
      expect(screen.getByText('Perfil atualizado')).toBeTruthy();
      expect(screen.queryByPlaceholderText('Seu nome')).toBeNull();
    });

    it('fecha o modal de sucesso no Ok', async () => {
      abrirEdicaoDeNome();
      fireEvent.press(screen.getByText('Salvar'));
      await screen.findByTestId('modal-sucesso');

      fireEvent.press(screen.getByTestId('modal-ok'));

      expect(screen.queryByTestId('modal-sucesso')).toBeNull();
    });

    it('avisa e mantém a edição aberta quando a gravação falha', async () => {
      mockUpdateDoc.mockRejectedValue(new Error('offline'));

      abrirEdicaoDeNome();
      fireEvent.press(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Não foi possível atualizar o perfil'),
      );
      expect(screen.getByPlaceholderText('Seu nome')).toBeTruthy();
    });

    it('cancelar fecha a edição sem gravar', () => {
      abrirEdicaoDeNome();

      fireEvent.press(screen.getByText('Cancelar'));

      expect(mockUpdateDoc).not.toHaveBeenCalled();
      expect(screen.queryByPlaceholderText('Seu nome')).toBeNull();
    });
  });

  describe('telefone', () => {
    function abrirEdicaoDeTelefone() {
      renderizar();
      fireEvent.press(screen.getByText('Telefone'));
    }

    // Nove e dez dígitos são os dois lados da borda. Testar só um número bem
    // curto deixa o limite livre para escorregar.
    it('recusa telefone com nove dígitos', () => {
      abrirEdicaoDeTelefone();

      fireEvent.changeText(screen.getByPlaceholderText('(11) 91234-5678'), '119967843');
      fireEvent.press(screen.getByText('Salvar'));

      expect(mockShowError).toHaveBeenCalledWith('Telefone inválido', { title: 'Atenção' });
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('aceita telefone fixo de dez dígitos', async () => {
      abrirEdicaoDeTelefone();

      fireEvent.changeText(screen.getByPlaceholderText('(11) 91234-5678'), '1133224455');
      fireEvent.press(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          { path: 'users/user-1' },
          { phone: '1133224455' },
        ),
      );
    });

    // Documento legado pode ter o telefone gravado COM máscara. Abrir e salvar
    // sem digitar nada tem que normalizar, não regravar a máscara.
    it('normaliza telefone legado que veio com máscara do Firestore', async () => {
      mockMeAtual = { ...ME_PADRAO, phone: '(11) 99678-4399' };

      abrirEdicaoDeTelefone();
      fireEvent.press(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          { path: 'users/user-1' },
          { phone: '11996784399' },
        ),
      );
    });

    // Apagar o telefone é uma escolha válida, não um telefone inválido.
    it('aceita apagar o telefone', async () => {
      abrirEdicaoDeTelefone();

      fireEvent.changeText(screen.getByPlaceholderText('(11) 91234-5678'), '');
      fireEvent.press(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(mockUpdateDoc).toHaveBeenCalledWith({ path: 'users/user-1' }, { phone: '' }),
      );
    });

    it('grava só os dígitos, sem a máscara', async () => {
      abrirEdicaoDeTelefone();

      fireEvent.changeText(screen.getByPlaceholderText('(11) 91234-5678'), '(11) 98888-7777');
      fireEvent.press(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          { path: 'users/user-1' },
          { phone: '11988887777' },
        ),
      );
    });

    it('mostra o telefone novo com máscara depois de salvar', async () => {
      abrirEdicaoDeTelefone();

      fireEvent.changeText(screen.getByPlaceholderText('(11) 91234-5678'), '11988887777');
      fireEvent.press(screen.getByText('Salvar'));

      expect(await screen.findByText('Telefone atualizado')).toBeTruthy();
      await fecharSucesso();
      expect(screen.getByText('(11) 98888-7777')).toBeTruthy();
    });

    it('cancelar devolve o telefone anterior ao campo', () => {
      abrirEdicaoDeTelefone();

      fireEvent.changeText(screen.getByPlaceholderText('(11) 91234-5678'), '11911112222');
      fireEvent.press(screen.getByText('Cancelar'));
      fireEvent.press(screen.getByText('Telefone'));

      expect(screen.getByPlaceholderText('(11) 91234-5678').props.value).toBe('(11) 99678-4399');
    });

    it('avisa quando a gravação do telefone falha', async () => {
      mockUpdateDoc.mockRejectedValue(new Error('offline'));

      abrirEdicaoDeTelefone();
      fireEvent.press(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Não foi possível atualizar o telefone'),
      );
    });
  });

  describe('troca de e-mail', () => {
    function preencherTrocaDeEmail(email: string, senha = 'senha123') {
      renderizar();
      fireEvent.press(screen.getByText('E-mail'));
      fireEvent.changeText(screen.getByPlaceholderText('novo@email.com'), email);
      if (senha) fireEvent.changeText(screen.getByPlaceholderText('Digite sua senha'), senha);
      fireEvent.press(screen.getByText('Confirmar'));
    }

    it('recusa e-mail sem arroba', () => {
      preencherTrocaDeEmail('jorge.email.com');

      expect(mockShowError).toHaveBeenCalledWith('Email inválido');
      expect(mockReautenticar).not.toHaveBeenCalled();
    });

    it('recusa e-mail sem ponto', () => {
      preencherTrocaDeEmail('jorge@email');

      expect(mockShowError).toHaveBeenCalledWith('Email inválido');
    });

    // Trocar o e-mail pelo mesmo gastaria um link de verificação e deslogaria o
    // dono no fim do fluxo por nada.
    it('recusa e-mail igual ao atual, ignorando maiúsculas no que foi digitado', () => {
      preencherTrocaDeEmail('Jorge@Antigo.com');

      expect(mockShowError).toHaveBeenCalledWith('O novo e-mail é igual ao atual.', {
        title: 'Atenção',
      });
      expect(mockReautenticar).not.toHaveBeenCalled();
    });

    // O Firebase guarda o e-mail com a caixa usada no cadastro. Sem normalizar
    // os DOIS lados, `Jorge@Antigo.com` no auth contra `jorge@antigo.com`
    // digitado passaria pela checagem e trocaria o e-mail pelo mesmo endereço.
    it('recusa e-mail igual ao atual mesmo quando o auth guarda outra caixa', () => {
      mockUsuario.email = 'Jorge@Antigo.COM';

      preencherTrocaDeEmail('jorge@antigo.com');

      expect(mockShowError).toHaveBeenCalledWith('O novo e-mail é igual ao atual.', {
        title: 'Atenção',
      });
      expect(mockReautenticar).not.toHaveBeenCalled();
    });

    it('exige a senha atual', () => {
      preencherTrocaDeEmail('novo@email.com', '');

      expect(mockShowError).toHaveBeenCalledWith('Digite sua senha para confirmar');
      expect(mockReautenticar).not.toHaveBeenCalled();
    });

    it('avisa quando o e-mail já pertence a outra conta, sem reautenticar', async () => {
      mockBuscarMetodos.mockResolvedValue(['password']);

      preencherTrocaDeEmail('ocupado@email.com');

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Este e-mail já está em uso por outro usuário.'),
      );
      expect(mockReautenticar).not.toHaveBeenCalled();
      expect(mockVerifyBeforeUpdateEmail).not.toHaveBeenCalled();
    });

    it('reautentica, manda o link e grava o pendente, tudo com o e-mail normalizado', async () => {
      preencherTrocaDeEmail('  NOVO@Email.COM ');

      await waitFor(() =>
        expect(mockVerifyBeforeUpdateEmail).toHaveBeenCalledWith('novo@email.com'),
      );
      expect(mockCredential).toHaveBeenCalledWith('jorge@antigo.com', 'senha123');
      expect(mockReautenticar).toHaveBeenCalledWith({
        email: 'jorge@antigo.com',
        senha: 'senha123',
      });
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { path: 'users/user-1' },
        { pendingEmail: 'novo@email.com' },
      );
    });

    it('fecha a edição e limpa os campos quando o dono fecha o aviso', async () => {
      preencherTrocaDeEmail('novo@email.com');

      await waitFor(() => expect(ultimoSucesso?.options?.title).toBe('Link enviado'));
      await fecharSucesso();

      expect(screen.queryByPlaceholderText('novo@email.com')).toBeNull();

      // Reabrir tem que mostrar campos vazios: a senha do dono não pode ficar
      // guardada no estado da tela depois do fluxo terminar.
      fireEvent.press(screen.getByText('E-mail'));
      expect(screen.getByPlaceholderText('novo@email.com').props.value).toBe('');
      expect(screen.getByPlaceholderText('Digite sua senha').props.value).toBe('');
    });

    it.each([
      ['auth/wrong-password', 'Senha incorreta'],
      ['auth/invalid-credential', 'Senha incorreta'],
      ['auth/too-many-requests', 'Muitas tentativas. Aguarde alguns minutos.'],
      ['auth/requires-recent-login', 'Faça login novamente para alterar seu e-mail.'],
      ['auth/email-already-in-use', 'Email já em uso por outro usuário.'],
      ['auth/invalid-email', 'Email inválido.'],
    ])('traduz %s para o dono', async (code, recado) => {
      mockReautenticar.mockRejectedValue({ code });

      preencherTrocaDeEmail('novo@email.com');

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(recado));
    });

    it('mostra a mensagem do Firebase quando o erro é desconhecido', async () => {
      mockReautenticar.mockRejectedValue({ code: 'auth/network-error', message: 'Sem rede.' });

      preencherTrocaDeEmail('novo@email.com');

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Não foi possível alterar.\nSem rede.'),
      );
    });

    it('avisa quando não há usuário logado', () => {
      mockInstanciaAuth.currentUser = null;
      mockMeAtual = null;

      renderizar();
      fireEvent.press(screen.getByText('E-mail'));
      fireEvent.press(screen.getByText('Confirmar'));

      expect(mockShowError).toHaveBeenCalledWith('Usuário não está logado');
    });

    it('avisa quando a referência do usuário não existe', () => {
      mockUsuario.uid = '';

      preencherTrocaDeEmail('novo@email.com');

      expect(mockShowError).toHaveBeenCalledWith('Referência do usuário inválida');
    });

    // A senha fica em estado da tela. Cancelar sem limpar deixaria a senha do
    // dono guardada em memória até ele sair da tela.
    it('cancelar fecha a edição e limpa e-mail e senha', () => {
      renderizar();
      fireEvent.press(screen.getByText('E-mail'));
      fireEvent.changeText(screen.getByPlaceholderText('novo@email.com'), 'novo@email.com');
      fireEvent.changeText(screen.getByPlaceholderText('Digite sua senha'), 'senha123');

      fireEvent.press(screen.getByText('Cancelar'));

      expect(screen.queryByPlaceholderText('novo@email.com')).toBeNull();
      expect(mockReautenticar).not.toHaveBeenCalled();

      fireEvent.press(screen.getByText('E-mail'));
      expect(screen.getByPlaceholderText('novo@email.com').props.value).toBe('');
      expect(screen.getByPlaceholderText('Digite sua senha').props.value).toBe('');
    });
  });

  describe('confirmação do e-mail novo', () => {
    beforeEach(() => {
      mockMeAtual = { ...ME_PADRAO, pendingEmail: 'novo@email.com' };
    });

    // O ramo "Não há e-mail pendente para confirmar." não é alcançável pela
    // interface: o botão de verificar só é renderizado quando existe pendente.
    // É guarda defensiva, não comportamento — e por isso não tem teste aqui.

    it('grava o e-mail novo, apaga o pendente e desloga ao fechar', async () => {
      mockReload.mockImplementation(async () => {
        mockUsuario.email = 'novo@email.com';
      });

      renderizar();
      fireEvent.press(screen.getByTestId('verificar-email'));

      await waitFor(() =>
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          { path: 'users/user-1' },
          { email: 'novo@email.com', pendingEmail: mockApagarCampo },
        ),
      );
      expect(ultimoSucesso?.options?.title).toBe('Email confirmado');

      await fecharSucesso();
      expect(mockAuthSignOut).toHaveBeenCalled();
    });

    it('avisa quando o link ainda não foi clicado', async () => {
      renderizar();

      fireEvent.press(screen.getByTestId('verificar-email'));

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith(
          'Clique no link que enviamos para seu novo email e tente novamente.',
          { title: 'Ainda não confirmado' },
        ),
      );
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    // Token expirado aqui significa que o e-mail MUDOU: o Firebase invalida a
    // sessão justamente por causa da troca. Tratar como erro faria o dono achar
    // que falhou.
    it('trata token expirado como troca concluída', async () => {
      mockReload.mockRejectedValue({ code: 'auth/user-token-expired' });

      renderizar();
      fireEvent.press(screen.getByTestId('verificar-email'));

      await waitFor(() => expect(ultimoSucesso?.options?.title).toBe('Sessão expirada'));
      await fecharSucesso();
      expect(mockAuthSignOut).toHaveBeenCalled();
    });

    it('avisa quando a verificação falha por outro motivo', async () => {
      mockReload.mockRejectedValue({ code: 'auth/network-request-failed' });

      renderizar();
      fireEvent.press(screen.getByTestId('verificar-email'));

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith(
          'Não foi possível verificar a confirmação agora.',
        ),
      );
    });
  });

  describe('foto', () => {
    it('não faz nada quando o dono fecha a galeria', async () => {
      mockEscolherImagem.mockResolvedValue({ didCancel: true });

      renderizar();
      fireEvent.press(screen.getByTestId('trocar-foto'));

      await waitFor(() => expect(mockEscolherImagem).toHaveBeenCalled());
      expect(mockEnviarFoto).not.toHaveBeenCalled();
      expect(mockShowError).not.toHaveBeenCalled();
    });

    // `didCancel` é o sinal da biblioteca e tem que ganhar de um item residual
    // na lista. Sem isso, cancelar poderia subir uma foto que o dono descartou.
    it('respeita o cancelamento mesmo com item sobrando na resposta', async () => {
      mockEscolherImagem.mockResolvedValue({
        didCancel: true,
        assets: [{ uri: 'file:///descartada.jpg' }],
      });

      renderizar();
      fireEvent.press(screen.getByTestId('trocar-foto'));

      await waitFor(() => expect(mockEscolherImagem).toHaveBeenCalled());
      expect(mockEnviarFoto).not.toHaveBeenCalled();
    });

    it('não faz nada quando a galeria devolve item sem arquivo', async () => {
      mockEscolherImagem.mockResolvedValue({ assets: [{ fileName: 'x.jpg' }] });

      renderizar();
      fireEvent.press(screen.getByTestId('trocar-foto'));

      await waitFor(() => expect(mockEscolherImagem).toHaveBeenCalled());
      expect(mockEnviarFoto).not.toHaveBeenCalled();
    });

    it('mostra o motivo que o serviço devolve quando o upload falha', async () => {
      mockEscolherImagem.mockResolvedValue({ assets: [{ uri: 'file:///foto.jpg' }] });
      mockEnviarFoto.mockResolvedValue({ ok: false, message: 'Arquivo acima de 5 MB.' });

      renderizar();
      fireEvent.press(screen.getByTestId('trocar-foto'));

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Arquivo acima de 5 MB.'));
      expect(screen.queryByTestId('avatar')).toBeNull();
    });

    it('troca a foto quando o upload dá certo', async () => {
      mockEscolherImagem.mockResolvedValue({ assets: [{ uri: 'file:///foto.jpg' }] });

      renderizar();
      fireEvent.press(screen.getByTestId('trocar-foto'));

      await waitFor(() =>
        expect(mockEnviarFoto).toHaveBeenCalledWith('user-1', 'file:///foto.jpg'),
      );
      expect(screen.getByTestId('avatar').props.source).toEqual({ uri: 'https://cdn/nova.jpg' });
    });

    it('avisa quando a galeria estoura', async () => {
      mockEscolherImagem.mockRejectedValue(new Error('sem permissão'));

      renderizar();
      fireEvent.press(screen.getByTestId('trocar-foto'));

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Não foi possível atualizar a foto'),
      );
    });
  });

  describe('conta', () => {
    it('pede confirmação citando o e-mail e manda o link de troca de senha', async () => {
      renderizar();

      fireEvent.press(screen.getByText('Trocar senha'));

      expect(ultimaConfirmacao?.message).toBe('Enviar link de redefinição para jorge@antigo.com?');
      expect(mockEnviarResetSenha).not.toHaveBeenCalled();

      await act(async () => {
        await ultimaConfirmacao?.onConfirm();
      });

      expect(mockEnviarResetSenha).toHaveBeenCalledWith('jorge@antigo.com');
      expect(mockFeedback.showSuccess).toHaveBeenCalledWith(
        'Confira sua caixa de entrada para redefinir a senha.',
        { title: 'Enviado' },
      );
    });

    it('avisa quando não existe e-mail para redefinir', () => {
      mockUsuario.email = null;
      mockMeAtual = { firstName: 'Jorge', lastName: 'Ribeiro', phone: '' };

      renderizar();
      fireEvent.press(screen.getByText('Trocar senha'));

      expect(mockShowError).toHaveBeenCalledWith(
        'Não encontramos um e-mail para enviar a troca de senha.',
      );
      expect(mockFeedback.showConfirm).not.toHaveBeenCalled();
    });

    it('avisa quando o envio do link falha', async () => {
      mockEnviarResetSenha.mockRejectedValue(new Error('offline'));

      renderizar();
      fireEvent.press(screen.getByText('Trocar senha'));
      await act(async () => {
        await ultimaConfirmacao?.onConfirm();
      });

      expect(mockShowError).toHaveBeenCalledWith('Não foi possível enviar o link agora.');
    });

    it('pede confirmação destrutiva antes de encerrar a sessão', async () => {
      renderizar();

      fireEvent.press(screen.getByText('Sair'));

      expect(ultimaConfirmacao?.destructive).toBe(true);
      expect(mockSignOut).not.toHaveBeenCalled();

      await act(async () => {
        await ultimaConfirmacao?.onConfirm();
      });

      expect(mockSignOut).toHaveBeenCalled();
    });

    it('alterna entre tema claro e escuro', () => {
      renderizar();
      const antes = screen.queryByText('Tema claro') ? 'Tema claro' : 'Tema escuro';
      const depois = antes === 'Tema claro' ? 'Tema escuro' : 'Tema claro';

      fireEvent.press(screen.getByText(antes));

      expect(screen.getByText(depois)).toBeTruthy();
    });

    it('avisa que as preferências de notificação ainda não existem', () => {
      renderizar();

      fireEvent.press(screen.getByText('Notificações'));

      expect(mockFeedback.showSuccess).toHaveBeenCalledWith('Preferências em breve.', {
        title: 'Notificações',
      });
    });

    it('aponta o suporte', () => {
      renderizar();

      fireEvent.press(screen.getByText('Suporte'));

      expect(mockFeedback.showSuccess).toHaveBeenCalledWith(
        'Fale com a equipe DetailGo pelo suporte.',
        { title: 'Suporte' },
      );
    });
  });
});
