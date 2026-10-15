// O mock global de lucide é um Proxy que devolve uma função NOVA a cada
// acesso, então `Droplets` aqui não seria o mesmo objeto que o módulo importou
// e toda comparação por identidade falharia. Aqui as identidades são estáveis.
jest.mock('lucide-react-native', () => ({
  Droplets: 'Droplets',
  Shield: 'Shield',
  Sparkles: 'Sparkles',
  Wrench: 'Wrench',
  Zap: 'Zap',
}));

import { Droplets, Shield, Sparkles, Wrench, Zap } from 'lucide-react-native';

import { getShopServiceIcon } from './shopServiceIcons';

/** O ícone é escolhido pela chave quando existe, e pelo nome quando não. */
const icone = (name: string, iconKey?: string) =>
  getShopServiceIcon({ name, iconKey } as Parameters<typeof getShopServiceIcon>[0]);

describe('getShopServiceIcon', () => {
  describe('chave explícita ganha do nome', () => {
    it.each([
      ['wash', Droplets],
      ['polish', Sparkles],
      ['wax', Shield],
      ['express', Zap],
      ['engine', Wrench],
    ])('usa o ícone da chave %s mesmo com nome que diria outra coisa', (chave, esperado) => {
      // Nome de lavagem com chave de motor tem que respeitar a chave: ela é a
      // escolha do dono, e o nome é só palpite.
      expect(icone('Lavagem completa', chave)).toBe(esperado);
    });

    it('cai no nome quando a chave é a genérica', () => {
      expect(icone('Lavagem completa', 'default')).toBe(Droplets);
    });

    it('cai no nome quando não há chave', () => {
      expect(icone('Lavagem completa')).toBe(Droplets);
    });
  });

  describe('adivinhação pelo nome', () => {
    it.each([
      ['lavagem', Droplets],
      ['wash', Droplets],
      ['polimento', Sparkles],
      ['polish', Sparkles],
      ['cera', Shield],
      ['wax', Shield],
      ['express', Zap],
      ['motor', Wrench],
    ])('reconhece "%s"', (palavra, esperado) => {
      expect(icone(palavra)).toBe(esperado);
    });

    it('reconhece a palavra no meio do nome', () => {
      expect(icone('Super lavagem premium')).toBe(Droplets);
      expect(icone('Higienização de motor a vapor')).toBe(Wrench);
    });

    it('não depende de maiúsculas', () => {
      expect(icone('LAVAGEM')).toBe(Droplets);
      expect(icone('Cera Carnaúba')).toBe(Shield);
    });

    // Ordem importa: o primeiro que casar ganha. Um nome que contém duas
    // palavras precisa ter resultado previsível.
    it('o primeiro critério que casa é o que vale', () => {
      expect(icone('Lavagem com polimento')).toBe(Droplets);
      expect(icone('Polimento e cera')).toBe(Sparkles);
    });

    it('usa o genérico quando nada casa', () => {
      expect(icone('Serviço especial')).toBe(Sparkles);
      expect(icone('')).toBe(Sparkles);
    });
  });

  // `polish` e `default` apontam para o MESMO ícone (Sparkles). Nenhum teste
  // consegue separar os dois, e um erro que trocasse um pelo outro passaria
  // despercebido. Fica registrado aqui em vez de fingir que está coberto —
  // separar exigiria dar um ícone próprio ao polimento, que é decisão de
  // produto, não de teste.
  it('polimento e genérico compartilham o ícone, por ora', () => {
    expect(icone('polimento')).toBe(icone('Serviço especial'));
  });
});
