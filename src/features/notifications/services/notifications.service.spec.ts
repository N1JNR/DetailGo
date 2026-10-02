const mockCollection = jest.fn();
const mockQuery = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockWhere = jest.fn();
const mockOnSnapshot = jest.fn();
const mockGetDocs = jest.fn();
const mockWriteBatch = jest.fn();

const mockBatchUpdate = jest.fn();
const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn();

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: (...args: unknown[]) => mockCollection(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  writeBatch: (...args: unknown[]) => mockWriteBatch(...args),
}));

import {
  watchShopNotifications,
  watchUserNotifications,
  markAllNotificationsRead,
  markAllUserNotificationsRead,
  clearShopNotifications,
  clearUserNotifications,
} from './notifications.service';

describe('notifications.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBatchUpdate.mockReset();
    mockBatchDelete.mockReset();
    mockBatchCommit.mockReset();
    mockWriteBatch.mockReturnValue({
      update: mockBatchUpdate,
      delete: mockBatchDelete,
      commit: mockBatchCommit,
    });
  });

  describe('watchShopNotifications & watchUserNotifications', () => {
    it('scopes shop notifications query to shops/{shopId}/notifications and normalizes data', () => {
      const mockUnsubscribe = jest.fn();
      mockOnSnapshot.mockImplementation((_qy, onChange) => {
        onChange({
          docs: [
            {
              id: 'notif-1',
              data: () => ({
                type: 'appointment_created',
                title: 'Novo Agendamento',
                body: 'Agendamento em 10 min',
                appointmentId: 'app-1',
                customerName: 'João',
                serviceLabel: 'Lavagem Especial',
                startAtMs: 1700000000000,
                read: false,
                createdAt: { toMillis: () => 1690000000000 },
              }),
            },
            {
              id: 'notif-2',
              data: () => ({}),
            },
          ],
        });
        return mockUnsubscribe;
      });

      const onChange = jest.fn();
      const onError = jest.fn();

      const unsubscribe = watchShopNotifications('shop-123', onChange, onError);

      expect(mockCollection).toHaveBeenCalledWith(
        expect.anything(),
        'shops',
        'shop-123',
        'notifications',
      );
      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(50);
      expect(onChange).toHaveBeenCalledWith([
        {
          id: 'notif-1',
          type: 'appointment_created',
          title: 'Novo Agendamento',
          body: 'Agendamento em 10 min',
          appointmentId: 'app-1',
          customerName: 'João',
          serviceLabel: 'Lavagem Especial',
          startAtMs: 1700000000000,
          read: false,
          createdAtMs: 1690000000000,
        },
        {
          id: 'notif-2',
          type: 'appointment_created',
          title: 'Notificação',
          body: '',
          appointmentId: undefined,
          customerName: undefined,
          serviceLabel: undefined,
          startAtMs: null,
          read: false,
          createdAtMs: 0,
        },
      ]);
      expect(unsubscribe).toBe(mockUnsubscribe);
    });

    it('scopes user notifications query to users/{uid}/notifications', () => {
      const mockUnsubscribe = jest.fn();
      mockOnSnapshot.mockReturnValue(mockUnsubscribe);

      watchUserNotifications('user-456', jest.fn());

      expect(mockCollection).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'user-456',
        'notifications',
      );
    });

    it('passes onError listener to onSnapshot when error occurs', () => {
      mockOnSnapshot.mockImplementation((_qy, _onChange, onError) => {
        onError(new Error('snapshot-error'));
        return jest.fn();
      });

      const onError = jest.fn();
      watchShopNotifications('shop-123', jest.fn(), onError);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('markAllNotificationsRead & markAllUserNotificationsRead', () => {
    it('marks unread shop notifications as read via batch write', async () => {
      const mockDocRef = { path: 'shops/shop-123/notifications/n1' };
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            ref: mockDocRef,
          },
        ],
      });
      mockBatchCommit.mockResolvedValueOnce(undefined);

      await markAllNotificationsRead('shop-123');

      expect(mockCollection).toHaveBeenCalledWith(
        expect.anything(),
        'shops',
        'shop-123',
        'notifications',
      );
      expect(mockWhere).toHaveBeenCalledWith('read', '==', false);
      expect(mockBatchUpdate).toHaveBeenCalledWith(mockDocRef, { read: true });
      expect(mockBatchCommit).toHaveBeenCalled();
    });

    it('marks unread user notifications as read via batch write', async () => {
      const mockDocRef = { path: 'users/user-456/notifications/n2' };
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            ref: mockDocRef,
          },
        ],
      });
      mockBatchCommit.mockResolvedValueOnce(undefined);

      await markAllUserNotificationsRead('user-456');

      expect(mockCollection).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'user-456',
        'notifications',
      );
      expect(mockWhere).toHaveBeenCalledWith('read', '==', false);
      expect(mockBatchUpdate).toHaveBeenCalledWith(mockDocRef, { read: true });
      expect(mockBatchCommit).toHaveBeenCalled();
    });

    it('does nothing if no unread notifications exist', async () => {
      mockGetDocs.mockResolvedValueOnce({
        empty: true,
        docs: [],
      });

      await markAllNotificationsRead('shop-123');

      expect(mockBatchUpdate).not.toHaveBeenCalled();
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });
  });

  describe('clearShopNotifications & clearUserNotifications', () => {
    it('deletes shop notifications in batches until empty', async () => {
      const mockRef2 = { path: 'shops/shop-123/notifications/n2' };

      // Batch 1 has 400 docs (full page) -> triggers another page
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        size: 400,
        docs: Array.from({ length: 400 }, (_, i) => ({
          ref: { path: `shops/shop-123/notifications/n${i}` },
        })),
      });
      // Batch 2 has 1 doc (< 400 page limit) -> finishes loop
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        size: 1,
        docs: [{ ref: mockRef2 }],
      });

      mockBatchCommit.mockResolvedValue(undefined);

      await clearShopNotifications('shop-123');

      expect(mockCollection).toHaveBeenCalledWith(
        expect.anything(),
        'shops',
        'shop-123',
        'notifications',
      );
      expect(mockBatchDelete).toHaveBeenCalledTimes(401);
      expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    });

    it('deletes user notifications in batches', async () => {
      const mockRef1 = { path: 'users/user-456/notifications/n1' };

      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        size: 1,
        docs: [{ ref: mockRef1 }],
      });
      mockBatchCommit.mockResolvedValueOnce(undefined);

      await clearUserNotifications('user-456');

      expect(mockCollection).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'user-456',
        'notifications',
      );
      expect(mockBatchDelete).toHaveBeenCalledWith(mockRef1);
      expect(mockBatchCommit).toHaveBeenCalled();
    });

    it('returns immediately if collection is already empty', async () => {
      mockGetDocs.mockResolvedValueOnce({
        empty: true,
        size: 0,
        docs: [],
      });

      await clearShopNotifications('shop-123');

      expect(mockBatchDelete).not.toHaveBeenCalled();
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });
  });
});
