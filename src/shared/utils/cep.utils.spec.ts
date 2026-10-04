import { cepMask, cepOnlyDigits, fetchCep, formatCepAddress, type CepResult } from './cep.utils';

describe('cep.utils', () => {
  describe('cepOnlyDigits', () => {
    it('remove caracteres não numéricos e limita a 8 dígitos', () => {
      expect(cepOnlyDigits('01001-000')).toBe('01001000');
      expect(cepOnlyDigits('01.001-00099')).toBe('01001000');
      expect(cepOnlyDigits('abc-123')).toBe('123');
    });
  });

  describe('cepMask', () => {
    it('formata CEPs com mais de 5 dígitos no padrão 00000-000', () => {
      expect(cepMask('01001000')).toBe('01001-000');
      expect(cepMask('01001')).toBe('01001');
      expect(cepMask('010')).toBe('010');
    });
  });

  describe('fetchCep', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('retorna null se o CEP não possuir 8 dígitos', async () => {
      const result = await fetchCep('123');
      expect(result).toBeNull();
    });

    it('retorna dados do CEP quando a API do ViaCEP responde com sucesso', async () => {
      const mockResult: CepResult = {
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
      };

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResult),
      } as unknown as Response);

      const result = await fetchCep('01001-000');

      expect(globalThis.fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/', {
        headers: { Accept: 'application/json' },
      });
      expect(result).toEqual(mockResult);
    });

    it('retorna null se a API indicar que o CEP é inexistente (erro: true)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ erro: true }),
      } as unknown as Response);

      const result = await fetchCep('99999-999');
      expect(result).toBeNull();
    });

    it('retorna null se a resposta da rede não for ok (!res.ok) ou se ocorrer exceção', async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
      } as unknown as Response);

      const result1 = await fetchCep('01001-000');
      expect(result1).toBeNull();

      globalThis.fetch = jest.fn().mockRejectedValueOnce(new Error('Erro de conexão'));

      const result2 = await fetchCep('01001-000');
      expect(result2).toBeNull();
    });
  });

  describe('formatCepAddress', () => {
    it('monta o endereço e cidade corretamente', () => {
      const mockResult: CepResult = {
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
      };

      expect(formatCepAddress(mockResult)).toEqual({
        address: 'Praça da Sé, Sé',
        city: 'São Paulo - SP',
      });
    });

    it('trata campos vazios no logradouro ou bairro', () => {
      const mockResult: CepResult = {
        cep: '01001-000',
        logradouro: '',
        bairro: 'Zona Rural',
        localidade: 'Interior',
        uf: 'MG',
      };

      expect(formatCepAddress(mockResult)).toEqual({
        address: 'Zona Rural',
        city: 'Interior - MG',
      });
    });
  });
});
