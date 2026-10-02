import { createHash } from 'node:crypto';
import * as admin from 'firebase-admin';

/** Chamadas de geocodificação por IP, por dia. */
export const TETO_DIARIO_POR_IP = 40;

/**
 * Identificador do IP, não o IP.
 *
 * Endereço de IP é dado pessoal, e estes contadores ficariam guardados para
 * sempre. O hash serve igual para contar — o mesmo IP cai sempre no mesmo
 * documento — e não deixa um registro de quem pediu o quê.
 *
 * O dia entra no hash de propósito: assim o mesmo IP gera identificadores
 * diferentes a cada dia, e os contadores não permitem seguir alguém ao longo
 * do tempo.
 */
function identificar(ip: string, dia: string): string {
  return createHash('sha256').update(`${dia}|${ip}`).digest('hex').slice(0, 32);
}

export type Veredito = { permitido: true } | { permitido: false; status: number; erro: string };

/**
 * IP de origem da requisição.
 *
 * Atrás do balanceador do Cloud Functions o IP real vem em `x-forwarded-for`,
 * numa lista onde o primeiro item é o cliente e os seguintes são os proxies.
 * Usar `req.ip` direto daria sempre o IP do balanceador, e o teto viraria um
 * teto global que derrubaria todo mundo junto.
 */
export function extrairIp(headers: Record<string, unknown>): string | null {
  const encaminhado = headers['x-forwarded-for'];
  const bruto = Array.isArray(encaminhado) ? encaminhado[0] : encaminhado;
  if (typeof bruto !== 'string') return null;

  const primeiro = bruto.split(',')[0]?.trim();
  return primeiro || null;
}

/** Dia em UTC, no formato AAAA-MM-DD. */
export function diaUtc(agoraMs: number): string {
  const d = new Date(agoraMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Chave do contador: um documento por IP por dia, com o IP já anonimizado. */
export function chaveDoDia(ip: string, agoraMs: number): string {
  const dia = diaUtc(agoraMs);
  return `${dia}_${identificar(ip, dia)}`;
}

/**
 * Conta e limita as chamadas de um IP no dia.
 *
 * As duas funções de geocodificação são chamadas só na tela de cadastro, antes
 * de a conta existir — por isso não dá para exigir login. Um cadastro real faz
 * menos de dez chamadas; o teto corta o abuso automatizado sem atrapalhar
 * ninguém.
 *
 * Em caso de falha do contador a requisição PASSA. Derrubar o cadastro porque o
 * contador teve um soluço troca um problema de custo por um de receita.
 */
export async function dentroDoLimite(
  db: admin.firestore.Firestore,
  ip: string | null,
  agoraMs: number,
  teto: number = TETO_DIARIO_POR_IP,
): Promise<Veredito> {
  if (!ip) return { permitido: true };

  const ref = db.doc(`geocodeQuotas/${chaveDoDia(ip, agoraMs)}`);

  try {
    // A transação devolve a decisão, não a contagem. Devolver o número obrigava
    // a recomparar com o teto aqui fora, e a comparação de fora discordava da
    // de dentro no caso da borda: ao bater exatamente no teto, a chamada era
    // barrada lá dentro e liberada aqui.
    const permitido = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const atual = (snap.data()?.chamadas as number | undefined) ?? 0;

      if (atual >= teto) return false;

      // Sem o IP no corpo do documento: a chave já identifica o contador, e
      // guardar o endereço de novo só recriaria o dado pessoal que o hash
      // existe para evitar.
      tx.set(
        ref,
        {
          chamadas: atual + 1,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return true;
    });

    if (!permitido) {
      return { permitido: false, status: 429, erro: 'Muitas consultas de endereço hoje.' };
    }

    return { permitido: true };
  } catch {
    return { permitido: true };
  }
}
