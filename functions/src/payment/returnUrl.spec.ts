// Importar `createAsaasCheckout` carrega `onRequest` e `defineSecret`, que
// exigem ambiente de função. Só a constante interessa aqui, e ela é estática.
jest.mock('firebase-functions/v2/https', () => ({ onRequest: () => undefined }));
jest.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'chave' }),
}));
jest.mock('firebase-functions/v2', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('firebase-admin', () => ({ firestore: jest.fn(), auth: jest.fn() }));

import { RETURN_URL } from './createAsaasCheckout';

/**
 * Para onde o navegador volta depois do checkout do Asaas.
 *
 * Existe porque isto já esteve errado em produção: a URL apontava para
 * `detailgo.app`, que não é o domínio do site (o CNAME do repositório do site é
 * `detailgo.com.br`), e `/assinatura` devolvia 404 — quem pagava caía numa
 * página de erro logo depois de pagar.
 *
 * Nenhum teste pega "a página existe", porque isso depende do site estar no ar.
 * O que dá para travar é o domínio e o caminho, que é onde o erro aconteceu.
 */
describe('URL de retorno do checkout', () => {
  it('aponta para o domínio do site publicado', () => {
    expect(RETURN_URL.startsWith('https://detailgo.com.br/')).toBe(true);
  });

  // O domínio errado de antes. Se alguém trouxer de volta, o teste avisa.
  it('não usa detailgo.app, que serve outro site', () => {
    expect(RETURN_URL).not.toContain('detailgo.app');
  });

  it('aponta para a página de retorno do pagamento', () => {
    expect(RETURN_URL).toBe('https://detailgo.com.br/assinatura');
  });

  // O Asaas recusa callback que não seja HTTPS.
  it('usa HTTPS', () => {
    expect(RETURN_URL.startsWith('https://')).toBe(true);
  });

  it('não leva barra no fim, que viraria 404 no GitHub Pages', () => {
    expect(RETURN_URL.endsWith('/')).toBe(false);
  });
});
