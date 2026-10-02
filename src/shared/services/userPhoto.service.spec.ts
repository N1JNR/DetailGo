const mockRef = jest.fn((_storage: any, path: string) => ({ path }));
const mockPutFile = jest.fn();
const mockGetDownloadURL = jest.fn();

jest.mock('@react-native-firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: (...args: [any, string]) => mockRef(...args),
  putFile: (...args: [any, string]) => mockPutFile(...args),
  getDownloadURL: (...args: [any]) => mockGetDownloadURL(...args),
}));

const mockDoc = jest.fn((_db: any, collection: string, id: string) => ({
  path: `${collection}/${id}`,
  collection,
  id,
}));
const mockSetDoc = jest.fn();
const mockDeleteField = jest.fn(() => 'MOCK_DELETE_FIELD');

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: (...args: [any, string, string]) => mockDoc(...args),
  setDoc: (...args: [any, any, any?]) => mockSetDoc(...args),
  deleteField: () => mockDeleteField(),
}));

import { uploadProfilePhoto } from './userPhoto.service';

describe('userPhoto.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadProfilePhoto', () => {
    it('deve enviar a foto para o Firebase Storage e atualizar o documento do usuario no Firestore', async () => {
      const uid = 'user-abc';
      const localUri = 'file:///path/to/image.jpg';
      const downloadUrl =
        'https://firebasestorage.googleapis.com/v0/b/app/o/users%2Fuser-abc%2Fprofile.jpg';

      mockPutFile.mockResolvedValueOnce(undefined);
      mockGetDownloadURL.mockResolvedValueOnce(downloadUrl);
      mockSetDoc.mockResolvedValueOnce(undefined);

      const result = await uploadProfilePhoto(uid, localUri);

      expect(result).toEqual({ ok: true, url: downloadUrl });

      // Asserta o caminho do arquivo no Storage
      expect(mockRef).toHaveBeenCalledWith(expect.anything(), `users/${uid}/profile.jpg`);
      expect(mockPutFile).toHaveBeenCalledWith({ path: `users/${uid}/profile.jpg` }, localUri);
      expect(mockGetDownloadURL).toHaveBeenCalledWith({ path: `users/${uid}/profile.jpg` });

      // Asserta o caminho do documento do usuario no Firestore e a remocao de photoB64
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', uid);
      expect(mockSetDoc).toHaveBeenCalledWith(
        { path: `users/${uid}`, collection: 'users', id: uid },
        { photoURL: downloadUrl, photoB64: 'MOCK_DELETE_FIELD' },
        { merge: true },
      );
    });

    it('deve retornar mensagem de erro quando o upload no Storage falhar', async () => {
      mockPutFile.mockRejectedValueOnce(new Error('Storage error: quota exceeded'));

      const result = await uploadProfilePhoto('user-123', 'file:///test.png');

      expect(result).toEqual({ ok: false, message: 'Storage error: quota exceeded' });
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('deve retornar mensagem generica de erro quando a excecao nao possuir mensagem', async () => {
      mockPutFile.mockRejectedValueOnce({});

      const result = await uploadProfilePhoto('user-123', 'file:///test.png');

      expect(result).toEqual({ ok: false, message: 'Não foi possível enviar a foto.' });
    });
  });
});
