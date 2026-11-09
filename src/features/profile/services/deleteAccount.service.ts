import auth, { getAuth } from '@react-native-firebase/auth';

const BASE = 'https://us-central1-magic-auto.cloudfunctions.net';

/** O que impede a exclusão agora, vindo do servidor. */
export type Impedimento = {
  codigo: 'assinatura_ativa' | 'agendamentos_futuros';
  mensagem: string;
};

export type ResultadoDaExclusao =
  | { ok: true }
  | { ok: false; impedimentos: Impedimento[] }
  | { ok: false; message: string };

/** Traduz o erro do Firebase na frase que a pessoa precisa ler. */
function motivoDaReautenticacao(codigo: unknown): string {
  switch (codigo) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Senha incorreta.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde alguns minutos.';
    case 'auth/network-request-failed':
      return 'Sem conexão. Tente de novo.';
    default:
      return 'Não foi possível confirmar sua senha.';
  }
}

/**
 * Pede a exclusão da conta e dos dados.
 *
 * Exige a senha porque o `deleteUser` do Admin SDK **não** pede login recente —
 * isso só vale no cliente. Sem reautenticar, um token vazado (válido por até
 * uma hora) apagaria a conta, enquanto trocar o e-mail no app pede a senha. A
 * ação mais destrutiva não pode exigir menos prova que a menos destrutiva.
 *
 * O servidor confere o mesmo pelo `auth_time` do token, então a trava existe
 * dos dois lados: aqui para dar a senha, lá para não aceitar quem não deu.
 *
 * O 409 não é falha: é o servidor dizendo o que resolver antes, e a tela mostra
 * isso como instrução.
 */
export async function requestAccountDeletion(senha: string): Promise<ResultadoDaExclusao> {
  const user = getAuth().currentUser;
  if (!user?.email) return { ok: false, message: 'Sessão expirada. Entre novamente.' };

  try {
    const credencial = auth.EmailAuthProvider.credential(user.email, senha);
    await user.reauthenticateWithCredential(credencial);
  } catch (e: any) {
    return { ok: false, message: motivoDaReautenticacao(e?.code) };
  }

  try {
    // Token novo depois de reautenticar: é ele que carrega o `auth_time`
    // recente que o servidor exige.
    const idToken = await user.getIdToken(true);

    const resposta = await fetch(`${BASE}/deleteAccount`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (resposta.status === 409) {
      const corpo = (await resposta.json().catch(() => ({}))) as {
        impedimentos?: Impedimento[];
      };
      return { ok: false, impedimentos: corpo.impedimentos ?? [] };
    }

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: string };
      return { ok: false, message: corpo.error || 'Não foi possível excluir a conta agora.' };
    }

    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível excluir a conta agora.' };
  }
}
