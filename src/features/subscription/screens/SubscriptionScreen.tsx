import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, CreditCard, LogOut, MessageCircle, ShieldCheck } from 'lucide-react-native';

import { radii, spacing, typography as T, useAppTheme, type AppColors } from '@shared/theme';
import { useFeedback } from '@shared/components/FeedbackProvider';
import { useShop, GRACE_DAYS } from '@features/shops';
import { useAuth } from '@features/auth';
import { createCheckoutLink, type MetodoPagamento } from '../services/checkout.service';

const PLAN_PRICE = 'R$ 89,00/m\u00eas';
const WHATSAPP_NUMBER = '5511996784399';

const BENEFITS = ['Agenda liberada', 'Loja vis\u00edvel no mapa', 'Hist\u00f3rico e dashboard'];

export default function SubscriptionScreen() {
  const { colors: D, isLight } = useAppTheme();
  const styles = useMemo(() => createStyles(D), [D]);

  const { shop, trialDaysLeft, isInGrace } = useShop();
  const { signOut } = useAuth();
  const { showError } = useFeedback();

  const [carregando, setCarregando] = useState<MetodoPagamento | null>(null);

  const isTrialActive = trialDaysLeft > 0;
  const priceValue = PLAN_PRICE.replace('/m\u00eas', '');

  /**
   * Abre o checkout do Asaas no navegador do sistema. \u00c9 l\u00e1 que o dono digita os
   * dados de pagamento \u2014 nada disso passa pelo app.
   *
   * O m\u00e9todo vai daqui porque o Asaas n\u00e3o aceita os dois no mesmo checkout:
   * recorrente s\u00f3 existe no cart\u00e3o, e Pix tem que ser avulso.
   */
  const abrirCheckout = async (metodo: MetodoPagamento) => {
    if (!shop?.id) return;
    setCarregando(metodo);

    try {
      const link = await createCheckoutLink(shop.id, metodo);
      await Linking.openURL(link);
    } catch (e: any) {
      // `||` e nao `??`: mensagem vazia e tao inutil quanto ausente, e com `??`
      // o dono levava um aviso em branco na tela de pagamento.
      showError(e?.message || 'N\u00e3o foi poss\u00edvel iniciar o pagamento. Tente novamente.');
    } finally {
      setCarregando(null);
    }
  };

  const handleWhatsApp = async () => {
    const text = encodeURIComponent(
      `Ol\u00e1! Acabei de fazer o pagamento do DetailGo Pro.\n\n` +
        `Loja: ${shop?.name ?? ''}\nID: ${shop?.id ?? ''}\n\nPode confirmar a ativa\u00e7\u00e3o?`,
    );
    const url = `whatsapp://send?phone=${WHATSAPP_NUMBER}&text=${text}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      showError(`Entre em contato: ${WHATSAPP_NUMBER}`, { title: 'WhatsApp n\u00e3o encontrado' });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} backgroundColor={D.bg} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.brand}>DETAILGO</Text>
          <TouchableOpacity
            testID="sair"
            onPress={signOut}
            style={styles.iconButton}
            activeOpacity={0.75}
          >
            <LogOut size={20} color={D.ink} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.statusPill}>
            <ShieldCheck size={14} color={isTrialActive ? D.status.warning : D.status.error} />
            <Text style={[styles.statusText, !isTrialActive && styles.statusExpired]}>
              {isTrialActive ? `Trial: ${trialDaysLeft} dias` : 'Trial expirado'}
            </Text>
          </View>

          <Text style={styles.title}>{isTrialActive ? 'Continue no Pro' : 'Ative seu plano'}</Text>
          <Text style={styles.subtitle}>
            {'Receba agendamentos e mantenha sua est\u00e9tica vis\u00edvel.'}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{priceValue}</Text>
            <View style={styles.priceMeta}>
              <Text style={styles.pricePeriod}>{'/m\u00eas'}</Text>
              <Text style={styles.priceSmall}>sem contrato</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        {isInGrace && (
          <View style={styles.graceCard}>
            <Text style={styles.graceTitle}>{'Pagamento pendente'}</Text>
            <Text style={styles.graceText}>
              {`Seu acesso continua liberado por ${GRACE_DAYS} dias enquanto tentamos a cobran\u00e7a. Regularize para n\u00e3o perder a agenda.`}
            </Text>
          </View>
        )}

        <View style={styles.benefitCard}>
          <Text style={styles.sectionTitle}>{'Inclu\u00eddo no plano'}</Text>
          <View style={styles.benefitGrid}>
            {BENEFITS.map(item => (
              <View key={item} style={styles.benefitItem}>
                <View style={styles.benefitIcon}>
                  <Check size={13} color={D.primary} strokeWidth={3} />
                </View>
                <Text style={styles.benefitText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.pixCard}>
          <View style={styles.pixHeader}>
            <View style={styles.pixIcon}>
              <CreditCard size={22} color={D.primary} strokeWidth={2.5} />
            </View>
            <View style={styles.pixTitleWrap}>
              <Text style={styles.pixTitle}>{'Como quer pagar'}</Text>
              <Text style={styles.pixSubtitle}>
                {'Libera\u00e7\u00e3o autom\u00e1tica ap\u00f3s a confirma\u00e7\u00e3o.'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            testID="assinar-cartao"
            style={[styles.primaryBtn, carregando !== null && styles.primaryBtnDisabled]}
            onPress={() => abrirCheckout('card')}
            disabled={carregando !== null}
            activeOpacity={0.86}
          >
            {carregando === 'card' ? (
              <ActivityIndicator color={D.onPrimary} />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>{'Cartão · renova sozinho'}</Text>
                <Text style={styles.primaryBtnPrice}>{priceValue}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Pix nao renova sozinho: o Asaas so aceita recorrencia no cartao.
              Dizer isso no botao evita o dono achar que ficou automatico. */}
          <TouchableOpacity
            testID="assinar-pix"
            style={[styles.secondaryBtn, carregando !== null && styles.primaryBtnDisabled]}
            onPress={() => abrirCheckout('pix')}
            disabled={carregando !== null}
            activeOpacity={0.86}
          >
            {carregando === 'pix' ? (
              <ActivityIndicator color={D.primary} />
            ) : (
              <Text style={styles.secondaryBtnText}>{'Pix · pagar mês a mês'}</Text>
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.supportBtn} onPress={handleWhatsApp} activeOpacity={0.82}>
          <MessageCircle size={18} color={D.ink} />
          <Text style={styles.supportText}>Suporte WhatsApp</Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>
          {'Renova\u00e7\u00e3o mensal. Cancele quando quiser.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function createStyles(D: AppColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: D.bg,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
    headerTop: {
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    brand: {
      color: D.ink,
      fontFamily: T.family.extraBold,
      fontSize: T.size.title,
      letterSpacing: 4,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: D.card,
      borderWidth: 1,
      borderColor: D.borderStrong,
    },
    heroCard: {
      borderRadius: radii.sm,
      padding: spacing.sm,
      backgroundColor: D.card,
      borderWidth: 1,
      borderColor: D.borderStrong,
    },
    statusPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.xl * 99,
      backgroundColor: D.primaryLight,
      marginBottom: spacing.sm,
    },
    statusText: {
      color: D.status.warning,
      fontFamily: T.family.bold,
      fontSize: T.size.secondary,
      lineHeight: T.lineHeight.secondary,
    },
    statusExpired: {
      color: D.status.error,
    },
    title: {
      color: D.ink,
      fontFamily: T.family.extraBold,
      fontSize: T.size.display,
      lineHeight: T.lineHeight.display,
      letterSpacing: 0,
    },
    subtitle: {
      color: D.ink2,
      fontFamily: T.family.medium,
      fontSize: T.size.body,
      lineHeight: T.lineHeight.body,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: D.border,
    },
    price: {
      color: D.primary,
      fontFamily: T.family.extraBold,
      fontSize: T.size.displayLarge,
      lineHeight: T.lineHeight.displayLarge,
      letterSpacing: 0,
    },
    priceMeta: {
      paddingBottom: spacing.xs,
    },
    pricePeriod: {
      color: D.ink,
      fontFamily: T.family.extraBold,
      fontSize: T.size.bodyLarge,
      lineHeight: T.lineHeight.body,
    },
    priceSmall: {
      color: D.ink3,
      fontFamily: T.family.medium,
      fontSize: T.size.secondary,
      lineHeight: T.lineHeight.secondary,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.sm,
    },
    benefitCard: {
      borderRadius: radii.sm,
      padding: spacing.sm,
      backgroundColor: D.surface,
      borderWidth: 1,
      borderColor: D.border,
    },
    graceCard: {
      borderRadius: radii.sm,
      padding: spacing.sm,
      backgroundColor: D.surface,
      borderWidth: 1,
      borderColor: D.status.warning,
      marginBottom: spacing.sm,
    },
    graceTitle: {
      color: D.status.warning,
      fontFamily: T.family.extraBold,
      fontSize: T.size.body,
      lineHeight: T.lineHeight.body,
      marginBottom: 4,
    },
    graceText: {
      color: D.ink2,
      fontFamily: T.family.regular,
      fontSize: T.size.secondary,
      lineHeight: T.lineHeight.secondary,
    },
    sectionTitle: {
      color: D.ink,
      fontFamily: T.family.extraBold,
      fontSize: T.size.bodyLarge,
      lineHeight: T.lineHeight.bodyLarge,
      marginBottom: spacing.sm,
    },
    benefitGrid: {
      gap: spacing.xs,
    },
    benefitItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    benefitIcon: {
      width: 24,
      height: 24,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: D.primaryLight,
    },
    benefitText: {
      flex: 1,
      color: D.ink2,
      fontFamily: T.family.semiBold,
      fontSize: T.size.secondary,
      lineHeight: T.lineHeight.secondary,
    },
    pixCard: {
      borderRadius: radii.sm,
      padding: spacing.sm,
      backgroundColor: D.surface,
      borderWidth: 1,
      borderColor: D.borderStrong,
    },
    pixHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    pixIcon: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: D.primaryLight,
    },
    pixTitleWrap: {
      flex: 1,
    },
    pixTitle: {
      color: D.ink,
      fontFamily: T.family.extraBold,
      fontSize: T.size.title,
      lineHeight: T.lineHeight.title,
    },
    pixSubtitle: {
      color: D.ink3,
      fontFamily: T.family.medium,
      fontSize: T.size.secondary,
      lineHeight: T.lineHeight.secondary,
      marginTop: spacing.xs / 2,
    },
    primaryBtn: {
      height: 52,
      borderRadius: radii.sm,
      backgroundColor: D.primary,
      alignItems: 'center',
      justifyContent: 'space-between',
      flexDirection: 'row',
      paddingHorizontal: spacing.lg,
    },
    primaryBtnDisabled: {
      opacity: 0.55,
    },
    secondaryBtn: {
      height: 52,
      borderRadius: radii.sm,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: D.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs,
    },
    secondaryBtnText: {
      color: D.primary,
      fontFamily: T.family.extraBold,
      fontSize: T.size.body,
      lineHeight: T.lineHeight.body,
    },
    primaryBtnText: {
      color: D.onPrimary,
      fontFamily: T.family.extraBold,
      fontSize: T.size.bodyLarge,
      lineHeight: T.lineHeight.body,
    },
    primaryBtnPrice: {
      color: D.onPrimary,
      fontFamily: T.family.extraBold,
      fontSize: T.size.bodyLarge,
      lineHeight: T.lineHeight.body,
    },
    qrArea: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    qrImage: {
      width: 144,
      height: 144,
      borderRadius: radii.sm,
      backgroundColor: D.qrBackground,
    },
    copyBtn: {
      width: '100%',
      height: 48,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: D.borderFocus,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    copyText: {
      color: D.primary,
      fontFamily: T.family.extraBold,
      fontSize: T.size.secondary,
    },
    copyTextDone: {
      color: D.status.success,
    },
    refreshBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs / 2,
    },
    refreshText: {
      color: D.ink3,
      fontFamily: T.family.semiBold,
      fontSize: T.size.secondary,
    },
    supportBtn: {
      marginTop: spacing.md,
      height: 50,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: D.borderStrong,
      backgroundColor: D.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    supportText: {
      color: D.ink,
      fontFamily: T.family.extraBold,
      fontSize: T.size.body,
    },
    footerNote: {
      color: D.ink3,
      fontFamily: T.family.medium,
      fontSize: T.size.caption,
      lineHeight: T.lineHeight.caption,
      textAlign: 'center',
    },
  });
}
