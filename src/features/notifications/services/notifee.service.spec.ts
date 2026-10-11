const mockCreateChannel = jest.fn();
const mockDisplayNotification = jest.fn();

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: (...args: unknown[]) => mockCreateChannel(...args),
    displayNotification: (...args: unknown[]) => mockDisplayNotification(...args),
  },
  AndroidImportance: {
    HIGH: 4,
  },
}));

import {
  ensureNotificationChannel,
  displayPushNotification,
  ANDROID_CHANNEL_ID,
} from './notifee.service';

describe('notifee.service', () => {
  beforeEach(() => {
    mockCreateChannel.mockReset();
    mockDisplayNotification.mockReset();

    mockCreateChannel.mockResolvedValue(ANDROID_CHANNEL_ID);
    mockDisplayNotification.mockResolvedValue('notification-id-123');
  });

  describe('ensureNotificationChannel', () => {
    it('cria o canal de alta prioridade com ID default no notifee', async () => {
      await ensureNotificationChannel();

      expect(mockCreateChannel).toHaveBeenCalledWith({
        id: 'default',
        name: 'Agendamentos',
        importance: 4,
        sound: 'default',
      });
    });
  });

  describe('displayPushNotification', () => {
    it('garante o canal e exibe a notificação local', async () => {
      await displayPushNotification('Agendamento Confirmado', 'Seu horário é 15:00', {
        appointmentId: 'app-999',
      });

      expect(mockCreateChannel).toHaveBeenCalled();
      expect(mockDisplayNotification).toHaveBeenCalledWith({
        title: 'Agendamento Confirmado',
        body: 'Seu horário é 15:00',
        data: { appointmentId: 'app-999' },
        android: {
          channelId: 'default',
          smallIcon: 'ic_launcher',
          importance: 4,
          pressAction: { id: 'default' },
        },
      });
    });
  });
});
