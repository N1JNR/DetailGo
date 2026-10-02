export type Coordenadas = { lat: number; lng: number };

export type ValidacaoDeCoordenadas =
  | { ok: true; coords: Coordenadas }
  | { ok: false; erro: string };

/**
 * Valida o par lat/lng antes de gastar uma chamada paga no Google.
 *
 * O corpo da requisição é JSON vindo da rede: `lat` pode chegar como string,
 * como null, como NaN ou fora do intervalo do planeta. Sem esta checagem, cada
 * um desses casos vira uma chamada cobrada que só volta erro — e o endereço
 * "91,200" não existe em lugar nenhum.
 */
export function validarCoordenadas(corpo: unknown): ValidacaoDeCoordenadas {
  const { lat, lng } = (corpo ?? {}) as { lat?: unknown; lng?: unknown };

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { ok: false, erro: 'lat e lng são obrigatórios e devem ser números.' };
  }

  // NaN e Infinity passam pelo typeof, e NaN nem falha nas comparações abaixo:
  // qualquer comparação com NaN é falsa, então ele escaparia dos dois ifs.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, erro: 'lat e lng devem ser números finitos.' };
  }

  if (lat < -90 || lat > 90) {
    return { ok: false, erro: 'lat deve estar entre -90 e 90.' };
  }

  if (lng < -180 || lng > 180) {
    return { ok: false, erro: 'lng deve estar entre -180 e 180.' };
  }

  return { ok: true, coords: { lat, lng } };
}

/**
 * Valida o endereço de texto antes de consultar o Google.
 *
 * O teto de tamanho não é capricho: o endereço entra na URL da chamada, e um
 * texto gigante vira uma requisição que o Google recusa depois de já ter sido
 * contada. Dois caracteres não geocodificam nada em lugar nenhum.
 */
export function validarEndereco(
  corpo: unknown,
): { ok: true; endereco: string } | { ok: false; erro: string } {
  const { address } = (corpo ?? {}) as { address?: unknown };

  if (typeof address !== 'string') {
    return { ok: false, erro: 'address é obrigatório.' };
  }

  const limpo = address.trim();

  if (limpo.length < 3) {
    return { ok: false, erro: 'address é curto demais.' };
  }

  if (limpo.length > 300) {
    return { ok: false, erro: 'address é longo demais.' };
  }

  return { ok: true, endereco: limpo };
}
