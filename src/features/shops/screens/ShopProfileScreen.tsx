import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, getDoc, getFirestore } from '@react-native-firebase/firestore';
import { ArrowLeft, ArrowRight, Calendar, Clock, MapPin } from 'lucide-react-native';

import type { RootStackParamList } from '@app/types';
import { typography as T, useAppTheme, type AppColors } from '@shared/theme';
import { formatUtils } from '@shared/utils/format.utils';
import { useShopServices, type ShopDoc } from '@features/shops';
import { getServiceVehicleSummary, getShopServiceIcon } from '@features/shops';
import type { ShopService } from '@features/shops/domain/shopService.types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ShopProfile'>;
type RouteParams = RouteProp<RootStackParamList, 'ShopProfile'>;

type ShopProfileData = Pick<ShopDoc, 'id' | 'name' | 'location'>;

export default function ShopProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteParams>();
  const { shopId } = route.params;

  const { colors: D, isLight } = useAppTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 42 : 16);
  const styles = useMemo(() => createStyles(D, bottomInset), [D, bottomInset]);

  const [shop, setShop] = useState<ShopProfileData | null>(null);
  const [hours, setHours] = useState<{ open: number; close: number } | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);

  const { items: services, loading: loadingServices } = useShopServices({
    shopId,
    activeOnly: true,
  });

  useEffect(() => {
    let mounted = true;
    const db = getFirestore();

    Promise.all([
      getDoc(doc(db, 'shops', shopId)),
      getDoc(doc(db, 'shops', shopId, 'settings', 'config')),
    ])
      .then(([shopSnap, settingsSnap]) => {
        if (!mounted) return;
        if (shopSnap.exists()) {
          const data = shopSnap.data() as Omit<ShopDoc, 'id'>;
          setShop({ id: shopSnap.id, name: data.name, location: data.location });
        }
        if (settingsSnap.exists()) {
          const s = settingsSnap.data() as { openHour?: number; closeHour?: number };
          setHours({ open: s.openHour ?? 8, close: s.closeHour ?? 18 });
        } else {
          setHours({ open: 8, close: 18 });
        }
      })
      .finally(() => mounted && setLoadingShop(false));

    return () => {
      mounted = false;
    };
  }, [shopId]);

  const handleSchedule = () => {
    navigation.navigate('Appointment', { shopId });
  };

  if (loadingShop || !shop) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={D.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} backgroundColor={D.bg} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable testID="voltar" style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={D.ink} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Detalhes da estética
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.shopName}>{shop.name}</Text>
            {shop.location?.address ? (
              <View style={styles.row}>
                <MapPin size={14} color={D.ink2} />
                <Text style={styles.metaText} numberOfLines={2}>
                  {shop.location.address}
                  {shop.location.city ? ` - ${shop.location.city}` : ''}
                </Text>
              </View>
            ) : null}

            {hours && (
              <View style={styles.row}>
                <Clock size={14} color={D.ink2} />
                <Text style={styles.metaText}>
                  Seg-Sex - {String(hours.open).padStart(2, '0')}h as{' '}
                  {String(hours.close).padStart(2, '0')}h
                </Text>
              </View>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Serviços oferecidos</Text>
            {services.length > 0 && <Text style={styles.sectionCount}>{services.length}</Text>}
          </View>

          {loadingServices ? (
            <View style={styles.servicesLoading}>
              <ActivityIndicator color={D.primary} size="small" />
            </View>
          ) : services.length === 0 ? (
            <View style={styles.servicesEmpty}>
              <Text style={styles.servicesEmptyText}>
                Esta estética ainda não cadastrou serviços.
              </Text>
            </View>
          ) : (
            <View style={styles.servicesList}>
              <FlatList
                data={services}
                keyExtractor={item => item.id}
                renderItem={({ item }) => <ServiceRow service={item} colors={D} />}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.servicesListContent}
              />
            </View>
          )}
        </View>

        <View style={styles.ctaWrap}>
          <Pressable
            style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
            onPress={handleSchedule}
          >
            <Calendar size={20} color={D.onPrimary} />
            <Text style={styles.ctaText}>Agendar serviço aqui</Text>
            <ArrowRight size={20} color={D.onPrimary} />
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}

function ServiceRow({ service, colors: D }: { service: ShopService; colors: AppColors }) {
  const styles = useMemo(() => createStyles(D), [D]);
  const Icon = getShopServiceIcon(service);

  return (
    <View style={styles.serviceRow}>
      <View style={styles.serviceIcon}>
        <Icon size={20} color={D.primary} />
      </View>
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceName}>{service.name}</Text>
        {service.description ? (
          <Text style={styles.serviceDesc} numberOfLines={2}>
            {service.description}
          </Text>
        ) : null}
        <Text style={styles.serviceVehicle}>{getServiceVehicleSummary(service)}</Text>
      </View>
      {typeof service.price === 'number' && (
        <Text style={styles.servicePrice}>{formatUtils.currencyCompact(service.price)}</Text>
      )}
    </View>
  );
}

function createStyles(D: AppColors, bottomInset = 0) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: D.bg },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: D.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: D.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerSpacer: {
      width: 36,
      height: 36,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: T.size.body,
      fontFamily: T.family.bold,
      color: D.ink,
    },

    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 96 + bottomInset,
    },

    heroCard: {
      backgroundColor: D.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: D.borderStrong,
      padding: 18,
      gap: 8,
      marginBottom: 22,
    },
    shopName: {
      fontSize: T.size.titleLarge,
      fontFamily: T.family.extraBold,
      color: D.ink,
      marginBottom: 4,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    metaText: {
      flex: 1,
      fontFamily: T.family.regular,
      fontSize: T.size.secondary,
      color: D.ink2,
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: T.size.bodyLarge,
      fontFamily: T.family.extraBold,
      color: D.ink,
    },
    sectionCount: {
      fontSize: T.size.secondary,
      color: D.ink3,
      fontFamily: T.family.medium,
    },

    servicesLoading: {
      height: 80,
      alignItems: 'center',
      justifyContent: 'center',
    },
    servicesEmpty: {
      padding: 24,
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: D.borderStrong,
      alignItems: 'center',
    },
    servicesEmptyText: {
      fontFamily: T.family.regular,
      fontSize: T.size.secondary,
      color: D.ink3,
      textAlign: 'center',
    },

    servicesList: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: D.borderStrong,
      backgroundColor: D.card,
      overflow: 'hidden',
    },
    servicesListContent: {
      paddingBottom: 2,
    },
    serviceRow: {
      minHeight: 94,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: D.border,
    },
    serviceIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: D.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    serviceInfo: { flex: 1 },
    serviceName: {
      fontSize: T.size.body,
      fontFamily: T.family.bold,
      color: D.ink,
      marginBottom: 2,
    },
    serviceDesc: {
      fontFamily: T.family.regular,
      fontSize: T.size.secondary,
      color: D.ink3,
    },
    serviceVehicle: {
      fontFamily: T.family.regular,
      fontSize: T.size.caption,
      color: D.ink2,
      marginTop: 3,
    },
    servicePrice: {
      fontSize: T.size.body,
      fontFamily: T.family.bold,
      color: D.primary,
    },

    ctaWrap: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      paddingBottom: 24 + bottomInset,
      backgroundColor: D.bg,
      borderTopWidth: 1,
      borderTopColor: D.border,
    },
    ctaBtn: {
      height: 56,
      borderRadius: 16,
      backgroundColor: D.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
      shadowColor: D.primary,
      shadowOpacity: 0.25,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 12,
      elevation: 6,
    },
    ctaBtnPressed: { opacity: 0.85 },
    ctaText: {
      fontSize: T.size.body,
      fontFamily: T.family.bold,
      color: D.onPrimary,
    },
  });
}
