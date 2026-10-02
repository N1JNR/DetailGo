import { validarCoordenadas, validarEndereco } from './coordenadas';

describe('validarCoordenadas', () => {
  it('aceita um par válido', () => {
    expect(validarCoordenadas({ lat: -23.5, lng: -46.6 })).toEqual({
      ok: true,
      coords: { lat: -23.5, lng: -46.6 },
    });
  });

  it('aceita os extremos do planeta', () => {
    expect(validarCoordenadas({ lat: -90, lng: -180 }).ok).toBe(true);
    expect(validarCoordenadas({ lat: 90, lng: 180 }).ok).toBe(true);
  });

  it('recusa latitude fora do intervalo', () => {
    expect(validarCoordenadas({ lat: 91, lng: 0 })).toEqual({
      ok: false,
      erro: 'lat deve estar entre -90 e 90.',
    });
    expect(validarCoordenadas({ lat: -90.1, lng: 0 }).ok).toBe(false);
  });

  it('recusa longitude fora do intervalo', () => {
    expect(validarCoordenadas({ lat: 0, lng: 180.5 })).toEqual({
      ok: false,
      erro: 'lng deve estar entre -180 e 180.',
    });
    expect(validarCoordenadas({ lat: 0, lng: -181 }).ok).toBe(false);
  });

  // O corpo vem de JSON da rede: número em string é o engano mais comum, e
  // passaria direto numa checagem de null.
  it('recusa números em formato de texto', () => {
    expect(validarCoordenadas({ lat: '-23.5', lng: '-46.6' }).ok).toBe(false);
  });

  it('recusa quando falta algum dos dois', () => {
    expect(validarCoordenadas({ lat: -23.5 }).ok).toBe(false);
    expect(validarCoordenadas({ lng: -46.6 }).ok).toBe(false);
    expect(validarCoordenadas({}).ok).toBe(false);
  });

  it('recusa nulo e indefinido', () => {
    expect(validarCoordenadas(null).ok).toBe(false);
    expect(validarCoordenadas(undefined).ok).toBe(false);
  });

  // NaN é do tipo number e escapa de toda comparação: `NaN < -90` é falso e
  // `NaN > 90` também. Sem a checagem de finito ele atravessaria inteiro.
  it('recusa NaN e infinito', () => {
    expect(validarCoordenadas({ lat: Number.NaN, lng: 0 })).toEqual({
      ok: false,
      erro: 'lat e lng devem ser números finitos.',
    });
    expect(validarCoordenadas({ lat: 0, lng: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  it('aceita a coordenada zero', () => {
    expect(validarCoordenadas({ lat: 0, lng: 0 }).ok).toBe(true);
  });
});

describe('validarEndereco', () => {
  it('aceita um endereço comum e devolve sem espaços nas pontas', () => {
    expect(validarEndereco({ address: '  Avenida Paulista, 1000  ' })).toEqual({
      ok: true,
      endereco: 'Avenida Paulista, 1000',
    });
  });

  it('recusa texto curto demais para geocodificar', () => {
    expect(validarEndereco({ address: 'ab' }).ok).toBe(false);
  });

  it('recusa quando só há espaços', () => {
    expect(validarEndereco({ address: '      ' }).ok).toBe(false);
  });

  // O endereço entra na URL da chamada paga: um texto gigante vira requisição
  // que o Google recusa depois de já ter contado.
  it('recusa texto longo demais', () => {
    expect(validarEndereco({ address: 'a'.repeat(301) }).ok).toBe(false);
    expect(validarEndereco({ address: 'a'.repeat(300) }).ok).toBe(true);
  });

  it('recusa quando não é texto', () => {
    expect(validarEndereco({ address: 123 }).ok).toBe(false);
    expect(validarEndereco({}).ok).toBe(false);
    expect(validarEndereco(null).ok).toBe(false);
  });
});
