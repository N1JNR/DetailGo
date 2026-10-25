import { valorCurto } from './valorCurto';

describe('valorCurto', () => {
  describe('valores não finitos', () => {
    it('retorna "R$ 0" para NaN', () => {
      expect(valorCurto(NaN)).toBe('R$ 0');
    });

    it('retorna "R$ 0" para Infinity e -Infinity', () => {
      expect(valorCurto(Infinity)).toBe('R$ 0');
      expect(valorCurto(-Infinity)).toBe('R$ 0');
    });
  });

  describe('valores numéricos válidos e arredondamento', () => {
    it('formata o zero corretamente', () => {
      expect(valorCurto(0)).toBe('R$ 0');
      expect(valorCurto(-0)).toBe('R$ 0');
    });

    it('formata números inteiros pequenos sem separador de milhar', () => {
      expect(valorCurto(50)).toBe('R$ 50');
      expect(valorCurto(999)).toBe('R$ 999');
    });

    it('arredonda valores decimais para o inteiro mais próximo', () => {
      expect(valorCurto(4280.49)).toBe('R$ 4.280');
      expect(valorCurto(4280.5)).toBe('R$ 4.281');
    });

    it('formata números grandes com separador de milhar no padrão brasileiro', () => {
      expect(valorCurto(1000)).toBe('R$ 1.000');
      expect(valorCurto(1234567)).toBe('R$ 1.234.567');
    });

    it('formata valores negativos corretamente com sinal e milhar', () => {
      expect(valorCurto(-12.3)).toBe('R$ -12');
      expect(valorCurto(-12.7)).toBe('R$ -13');
      expect(valorCurto(-1000000)).toBe('R$ -1.000.000');
    });
  });
});
