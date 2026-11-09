import { getAuth } from '@react-native-firebase/auth';

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

/**
 * Pede ao servidor a exclusão da conta e dos dados.
 *
 * Roda no servidor porque apagar a conta de Auth e tocar nos agendamentos da
 * estética exige Admin SDK — as regras não deixam o cliente fazer nem um nem
 * outro.
 *
 * O 409 não é falha: é o servidor dizendo o que precisa ser resolvido antes,
 * e a tela mostra isso como instrução, não como erro.
 */
export async function requestAccountDeletion(): Promise<ResultadoDaExclusao> {
  const user = getAuth().currentUser;
  if (!user) return { ok: false, message: 'Sessão expirada. Entre novamente.' };

  try {
    // `true` força token novo: a function verifica revogação, e um token velho
    // em cache seria recusado por algo que não é culpa de quem está pedindo.
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
