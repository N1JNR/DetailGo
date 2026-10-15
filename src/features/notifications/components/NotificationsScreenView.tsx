import React, { memo, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  Bell,
  CalendarCheck,
  CalendarX2,
  CheckCircle2,
  Clock,
  Trash2,
  XCircle,
} from 'lucide-react-native';

import { typography as T, useAppTheme, type AppColors } from '@shared/theme';
import { FadeInUp } from '@shared/components/FadeInUp';

import type { AppNotification } from '../domain/notification.types';

type Props = {
  items: AppNotification[];
  loading: boolean;
  subtitle: string;
  /** Chamado ao abrir a tela (ex.: marcar todas como lidas). */
  onOpened?: () => void;
  /** Se fornecido e houver itens, mostra o botão de limpar todas. */
  onClearAll?: () => void;
};

function relativeTime(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} d`;
  const date = new Date(ms);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}`;
}

export default function NotificationsScreenView({
  items,
  loading,
  subtitle,
  onOpened,
  onClearAll,
}: Props) {
  const { colors: D, isLight } = useAppTheme();
  const styles = useMemo(() => createStyles(D), [D]);
  const navigation = useNavigation();

  useEffect(() => {
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} backgroundColor={D.bg} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            testID="voltar"
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={D.ink} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Notificações</Text>
            <Text style={styles.headerSub}>{subtitle}</Text>
          </View>
          {onClearAll && items.length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={onClearAll}
              activeOpacity={0.7}
              testID="clear-all-notifications"
              accessibilityLabel="Limpar todas as notificações"
            >
              <Trash2 size={18} color={D.ink2} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        {loading && items.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={D.primary} size="large" />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centered}>
            <Bell size={40} color={D.ink3} strokeWidth={1.6} />
            <Text style={styles.emptyText}>Nenhuma notificação por aqui.</Text>
          </View>
        ) : (
          <FadeInUp style={styles.flexFill}>
            <FlatList
              data={items}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => <NotificationRow item={item} styles={styles} D={D} />}
            />
          </FadeInUp>
        )}
      </SafeAreaView>
    </>
  );
}

const NotificationRow = memo(function NotificationRow({
  item,
  styles,
  D,
}: {
  item: AppNotification;
  styles: ReturnType<typeof createStyles>;
  D: AppColors;
}) {
  const Icon =
    item.type === 'appointment_reminder'
      ? Clock
      : item.type === 'appointment_done'
      ? CheckCircle2
      : item.type === 'appointment_expired'
      ? CalendarX2
      : item.type === 'appointment_cancelled'
      ? XCircle
      : CalendarCheck;
  return (
    <View style={[styles.row, !item.read && styles.rowUnread]}>
      <View style={styles.rowIcon}>
        <Icon size={18} color={D.primary} strokeWidth={2.1} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowText}>{item.body}</Text>
        <Text style={styles.rowTime}>{relativeTime(item.createdAtMs)}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </View>
  );
});

function createStyles(D: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: D.bg },
    flexFill: { flex: 1 },

    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
      gap: 14,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: D.card,
      borderWidth: 1,
      borderColor: D.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: D.card,
      borderWidth: 1,
      borderColor: D.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1 },
    headerTitle: {
      fontSize: 26,
      fontFamily: T.family.extraBold,
      color: D.ink,
      letterSpacing: -0.5,
    },
    headerSub: {
      fontSize: 13,
      color: D.ink3,
      marginTop: 2,
      fontFamily: T.family.medium,
    },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 14, fontFamily: T.family.regular, color: D.ink3 },

    listContent: { paddingHorizontal: 20, paddingBottom: 32 },

    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: D.card,
      borderWidth: 1,
      borderColor: D.border,
      marginBottom: 10,
    },
    rowUnread: {
      backgroundColor: D.primaryLight,
      borderColor: D.borderFocus,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: D.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1, gap: 2 },
    rowTitle: {
      fontSize: T.size.body,
      lineHeight: T.lineHeight.body,
      fontFamily: T.family.bold,
      color: D.ink,
    },
    rowText: {
      fontSize: T.size.secondary,
      lineHeight: T.lineHeight.secondary,
      fontFamily: T.family.regular,
      color: D.ink2,
    },
    rowTime: {
      fontSize: T.size.caption,
      lineHeight: T.lineHeight.caption,
      fontFamily: T.family.medium,
      color: D.ink3,
      marginTop: 2,
    },
    unreadDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: D.primary,
      marginTop: 4,
    },
  });
}
