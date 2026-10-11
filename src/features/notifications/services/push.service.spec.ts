import { PermissionsAndroid, Platform } from 'react-native';

const mockGetMessaging = jest.fn();
const mockRequestPermission = jest.fn();
const mockGetToken = jest.fn();
const mockOnTokenRefresh = jest.fn();

const mockSetDoc = jest.fn();
const mockDoc = jest.fn();
const mockArrayUnion = jest.fn();

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: (...args: unknown[]) => mockGetMessaging(...args),
  requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
  getToken: (...args: unknown[]) => mockGetToken(...args),
  onTokenRefresh: (...args: unknown[]) => mockOnTokenRefresh(...args),
  AuthorizationStatus: {
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    DENIED: 0,
  },
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  arrayUnion: (...args: unknown[]) => mockArrayUnion(...args),
}));

import { requestPushPermission, registerFcmToken } from './push.service';

describe('push.service', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetDoc.mockReset();
    mockDoc.mockReset();
    mockArrayUnion.mockReset();
    mockRequestPermission.mockReset();
    mockGetToken.mockReset();
    mockOnTokenRefresh.mockReset();

    mockDoc.mockReturnValue('DOC_USER_REF');
    mockArrayUnion.mockImplementation((val: string) => `ARRAY_UNION_${val}`);
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    Object.defineProperty(Platform, 'Version', { value: originalVersion, configurable: true });
  });

  describe('requestPushPermission', () => {
    it('solicita permissão Android POST_NOTIFICATIONS quando for Android e API >= 33', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      Object.defineProperty(Platform, 'Version', { value: 33, configurable: true });

      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED);
      mockRequestPermission.mockResolvedValueOnce(1); // AUTHORIZED

      const granted = await requestPushPermission();

      expect(PermissionsAndroid.request).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      expect(mockRequestPermission).toHaveBeenCalled();
      expect(granted).toBe(true);
    });

    it('retorna false se a permissão Android for negada', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      Object.defineProperty(Platform, 'Version', { value: 33, configurable: true });

      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);

      const granted = await requestPushPermission();

      expect(PermissionsAndroid.request).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      expect(granted).toBe(false);
      expect(mockRequestPermission).not.toHaveBeenCalled();
    });

    it('no iOS ou Android < 33, chama messaging.requestPermission diretamente sem PermissionsAndroid', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
      Object.defineProperty(Platform, 'Version', { value: 16, configurable: true });
      const spyRequest = jest.spyOn(PermissionsAndroid, 'request');

      mockRequestPermission.mockResolvedValueOnce(2); // PROVISIONAL

      const granted = await requestPushPermission();

      expect(spyRequest).not.toHaveBeenCalled();
      expect(mockRequestPermission).toHaveBeenCalled();
      expect(granted).toBe(true);
    });

    it('retorna false se houver exceção na solicitação', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      Object.defineProperty(Platform, 'Version', { value: 30, configurable: true });
      mockRequestPermission.mockRejectedValueOnce(new Error('Push disabled'));

      const granted = await requestPushPermission();

      expect(granted).toBe(false);
    });
  });

  describe('registerFcmToken', () => {
    it('obtém o token FCM, salva no documento do usuário em users/{uid} com arrayUnion e assina renovação', async () => {
      mockGetToken.mockResolvedValueOnce('fcm-token-123');
      const mockUnsubRefresh = jest.fn();
      mockOnTokenRefresh.mockReturnValueOnce(mockUnsubRefresh);

      const unsub = await registerFcmToken('user-555');

      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', 'user-555');
      expect(mockArrayUnion).toHaveBeenCalledWith('fcm-token-123');
      expect(mockSetDoc).toHaveBeenCalledWith(
        'DOC_USER_REF',
        { fcmTokens: 'ARRAY_UNION_fcm-token-123' },
        { merge: true },
      );
      expect(mockOnTokenRefresh).toHaveBeenCalled();
      expect(unsub).toBe(mockUnsubRefresh);
    });

    it('atualiza o token no Firestore quando onTokenRefresh é disparado', async () => {
      mockGetToken.mockResolvedValueOnce(null);
      let refreshCallback: ((token: string) => Promise<void>) | undefined;
      mockOnTokenRefresh.mockImplementationOnce((_messaging, cb) => {
        refreshCallback = cb;
        return jest.fn();
      });

      await registerFcmToken('user-555');

      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(refreshCallback).toBeDefined();

      await refreshCallback!('new-refreshed-token');

      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', 'user-555');
      expect(mockArrayUnion).toHaveBeenCalledWith('new-refreshed-token');
      expect(mockSetDoc).toHaveBeenCalledWith(
        'DOC_USER_REF',
        { fcmTokens: 'ARRAY_UNION_new-refreshed-token' },
        { merge: true },
      );
    });

    it('captura erro no getToken silenciosamente e ainda assim assina renovação', async () => {
      mockGetToken.mockRejectedValueOnce(new Error('Google Play Services unavailable'));
      const mockUnsub = jest.fn();
      mockOnTokenRefresh.mockReturnValueOnce(mockUnsub);

      const unsub = await registerFcmToken('user-555');

      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(unsub).toBe(mockUnsub);
    });
  });
});
