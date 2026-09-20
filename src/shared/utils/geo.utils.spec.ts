import {
  generateGeohash,
  distanceKm,
  formatDistance,
  geocodeAddress,
  reverseGeocode,
} from './geo.utils';

describe('geo.utils', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('generateGeohash', () => {
    it('gera geohash correto para coordenadas dadas', () => {
      const hash = generateGeohash(-23.55052, -46.633308);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).toBe('6gyf4bf8m0');
    });
  });

  describe('distanceKm', () => {
    it('calcula a distancia em quilometros entre dois pontos', () => {
      const coord1 = { lat: -23.55052, lng: -46.633308 };
      const coord2 = { lat: -23.561724, lng: -46.655981 };
      const dist = distanceKm(coord1, coord2);
      expect(dist).toBeGreaterThan(2);
      expect(dist).toBeLessThan(3);
    });

    it('retorna 0 para a mesma coordenada', () => {
      const coord = { lat: -23.55052, lng: -46.633308 };
      expect(distanceKm(coord, coord)).toBe(0);
    });
  });

  describe('formatDistance', () => {
    it('formata distancias menores que 1km em metros', () => {
      expect(formatDistance(0.8)).toBe('800m');
      expect(formatDistance(0.05)).toBe('50m');
      expect(formatDistance(0)).toBe('0m');
    });

    it('formata distancias maiores ou iguais a 1km em km com uma casa decimal', () => {
      expect(formatDistance(1.0)).toBe('1.0km');
      expect(formatDistance(2.54)).toBe('2.5km');
      expect(formatDistance(10.89)).toBe('10.9km');
    });
  });

  describe('geocodeAddress', () => {
    it('retorna coordenadas via Cloud Function quando a chamada eh bem-sucedida', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ lat: -23.55, lng: -46.63 }),
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await geocodeAddress('Avenida Paulista, Sao Paulo');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://us-central1-magic-auto.cloudfunctions.net/geocode',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: 'Avenida Paulista, Sao Paulo' }),
        }),
      );
      expect(result).toEqual({ lat: -23.55, lng: -46.63 });
    });

    it('usa fallback Nominatim se Cloud Function falhar e retorna coordenadas', async () => {
      const mockFetch = jest
        .fn()
        // Primeira chamada (Cloud Function) falha ou nao esta ok
        .mockResolvedValueOnce({ ok: false })
        // Segunda chamada (Nominatim) sucede
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ lat: '-23.55052', lon: '-46.633308' }],
        });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await geocodeAddress('Avenida Paulista, Sao Paulo');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('nominatim.openstreetmap.org/search'),
        expect.objectContaining({
          headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'DetailGoApp/1.0' },
        }),
      );
      expect(result).toEqual({ lat: -23.55052, lng: -46.633308 });
    });

    it('retorna null quando Cloud Function lança erro e Nominatim retorna array vazio', async () => {
      const mockFetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await geocodeAddress('Endereço Inexistente XYZ');
      expect(result).toBeNull();
    });

    it('retorna null quando Nominatim tambem falha/lança exceção', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await geocodeAddress('Endereço Inexistente XYZ');
      expect(result).toBeNull();
    });
  });

  describe('reverseGeocode', () => {
    it('retorna endereco via Cloud Function quando bem-sucedida', async () => {
      const mockData = {
        address: 'Rua Augusta, Consolação',
        city: 'São Paulo - SP',
        cep: '01305000',
      };
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await reverseGeocode({ lat: -23.55, lng: -46.63 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://us-central1-magic-auto.cloudfunctions.net/reverseGeocode',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ lat: -23.55, lng: -46.63 }),
        }),
      );
      expect(result).toEqual(mockData);
    });

    it('usa fallback Nominatim se Cloud Function falhar e formata resultado', async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            address: {
              road: 'Rua Augusta',
              suburb: 'Consolação',
              city: 'São Paulo',
              state: 'SP',
              postcode: '01305-000',
            },
          }),
        });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await reverseGeocode({ lat: -23.55, lng: -46.63 });

      expect(result).toEqual({
        address: 'Rua Augusta, Consolação',
        city: 'São Paulo - SP',
        cep: '01305000',
      });
    });

    it('trata campos opcionais e faltantes no fallback Nominatim', async () => {
      const mockFetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('CF Error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            address: {
              pedestrian: 'Calçadão',
              neighbourhood: 'Centro',
              town: 'Campinas',
            },
          }),
        });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await reverseGeocode({ lat: -22.9, lng: -47.06 });

      expect(result).toEqual({
        address: 'Calçadão, Centro',
        city: 'Campinas',
        cep: undefined,
      });
    });

    it('retorna null se ambas Cloud Function e Nominatim falharem', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Fetch error'));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await reverseGeocode({ lat: 0, lng: 0 });
      expect(result).toBeNull();
    });
  });
});
