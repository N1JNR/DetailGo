declare const global: any;

const mockGetCrashlytics = jest.fn(() => ({ type: 'mock-crashlytics-instance' }));
const mockSetCrashlyticsCollectionEnabled = jest.fn();
const mockSetUserId = jest.fn();
const mockRecordError = jest.fn();
const mockLog = jest.fn();

jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: () => mockGetCrashlytics(),
  setCrashlyticsCollectionEnabled: (...args: [any, boolean]) =>
    mockSetCrashlyticsCollectionEnabled(...args),
  setUserId: (...args: [any, string]) => mockSetUserId(...args),
  recordError: (...args: [any, any]) => mockRecordError(...args),
  log: (...args: [any, string]) => mockLog(...args),
}));

import { initCrashlytics, setCrashUser, clearCrashUser, reportError } from './crashlytics.service';

describe('crashlytics.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initCrashlytics', () => {
    it('deve desabilitar a coleta do Crashlytics em modo de desenvolvimento (__DEV__ === true)', () => {
      // No ambiente de teste Jest com setup global, __DEV__ é true por padrão
      initCrashlytics();

      expect(mockGetCrashlytics).toHaveBeenCalled();
      expect(mockSetCrashlyticsCollectionEnabled).toHaveBeenCalledWith(
        { type: 'mock-crashlytics-instance' },
        false,
      );
    });

    it('deve habilitar a coleta do Crashlytics em modo de producao (__DEV__ === false)', () => {
      const originalDev = global.__DEV__;
      global.__DEV__ = false;

      try {
        initCrashlytics();

        expect(mockGetCrashlytics).toHaveBeenCalled();
        expect(mockSetCrashlyticsCollectionEnabled).toHaveBeenCalledWith(
          { type: 'mock-crashlytics-instance' },
          true,
        );
      } finally {
        global.__DEV__ = originalDev;
      }
    });
  });

  describe('setCrashUser', () => {
    it('deve associar o ID do usuario ao Crashlytics', () => {
      setCrashUser('user-999');

      expect(mockGetCrashlytics).toHaveBeenCalled();
      expect(mockSetUserId).toHaveBeenCalledWith({ type: 'mock-crashlytics-instance' }, 'user-999');
    });
  });

  describe('clearCrashUser', () => {
    it('deve limpar o ID do usuario associado ao Crashlytics enviando string vazia', () => {
      clearCrashUser();

      expect(mockGetCrashlytics).toHaveBeenCalled();
      expect(mockSetUserId).toHaveBeenCalledWith({ type: 'mock-crashlytics-instance' }, '');
    });
  });

  describe('reportError', () => {
    it('deve registrar uma instancia de Error no Crashlytics sem contexto', () => {
      const testError = new Error('Falha de conexao');

      reportError(testError);

      expect(mockGetCrashlytics).toHaveBeenCalled();
      expect(mockLog).not.toHaveBeenCalled();
      expect(mockRecordError).toHaveBeenCalledWith(
        { type: 'mock-crashlytics-instance' },
        testError,
      );
    });

    it('deve registrar um erro nao-Error encapsulando em uma instancia de Error', () => {
      reportError('Erro em formato de string');

      expect(mockGetCrashlytics).toHaveBeenCalled();
      expect(mockRecordError).toHaveBeenCalledWith(
        { type: 'mock-crashlytics-instance' },
        expect.any(Error),
      );
      const passedError = mockRecordError.mock.calls[0][1];
      expect(passedError.message).toBe('Erro em formato de string');
    });

    it('deve registrar o contexto como log/breadcrumb antes de registrar o erro', () => {
      const testError = new Error('Erro na API');
      const context = 'FALHA_NO_CHECKOUT';

      reportError(testError, context);

      expect(mockGetCrashlytics).toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith(
        { type: 'mock-crashlytics-instance' },
        'FALHA_NO_CHECKOUT',
      );
      expect(mockRecordError).toHaveBeenCalledWith(
        { type: 'mock-crashlytics-instance' },
        testError,
      );
    });
  });
});
