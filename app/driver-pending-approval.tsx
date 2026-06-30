import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { openExternalUrl } from './utils/openExternalUrl';
import { getAuthToken, removeAuthToken } from './utils/authTokenStorage';

const POLL_MS = 12_000;
const WA_DRIVER = '22997000000';

type CheckSource = 'initial' | 'poll' | 'manual';

export default function DriverPendingApprovalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const checkStatus = useCallback(
    async (source: CheckSource = 'poll') => {
      const showBlockingSpinner = source === 'initial' || source === 'manual';
      try {
        if (showBlockingSpinner) setIsChecking(true);
        const token = await getAuthToken();

        if (!token || !getApiBaseUrl()) {
          return;
        }

        const res = await apiFetch('/driver/profile', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!res) {
          return;
        }

        if (res.status === 401) {
          await removeAuthToken();
          await AsyncStorage.removeItem('authUser');
          router.replace('/driver-onboarding');
          return;
        }

        const json = await res.json().catch(() => null);

        if (json?.profile) {
          const status = json.profile.status;

          if (status === 'approved') {
            router.replace('/driver-approved-success');
            return;
          }
          if (status === 'rejected') {
            router.replace('/driver-application-rejected');
            return;
          }
        }

        setLastCheck(new Date());
      } catch (error) {
        console.error('Erreur lors de la vérification du statut:', error);
      } finally {
        if (showBlockingSpinner) setIsChecking(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void checkStatus('initial');
    const interval = setInterval(() => {
      void checkStatus('poll');
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleRefresh = () => {
    void checkStatus('manual');
  };

  const openSupport = () => {
    const text =
      "Bonjour, je suis chauffeur candidat sur l'app TIC MITON. Ma demande est en attente de validation — pouvez-vous m'aider ?";
    void openExternalUrl(`https://wa.me/${WA_DRIVER}?text=${encodeURIComponent(text)}`).then((ok) => {
      if (!ok) Alert.alert('Erreur', "Impossible d'ouvrir WhatsApp.");
    });
  };

  const handleLogout = async () => {
    await removeAuthToken();
    await AsyncStorage.multiRemove(['authUser', 'hasSeenApprovalSuccess']);
    router.replace('/driver-onboarding');
  };

  const lastCheckLabel =
    lastCheck === null
      ? '—'
      : lastCheck.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient
        colors={['#E8ECFF', '#F0F4FF', Colors.background]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) - 8 }]}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Validation du dossier
          </Text>
          <TouchableOpacity
            onPress={handleLogout}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.headerLink}
            accessibilityRole="button"
            accessibilityLabel="Se déconnecter"
          >
            <Text style={styles.headerLinkText}>Déconnexion</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.heroRing, { transform: [{ scale: pulse }] }]}>
            <LinearGradient colors={[...Gradients.primary]} style={styles.heroGradient}>
              <Ionicons name="hourglass-outline" size={44} color={Colors.white} />
            </LinearGradient>
          </Animated.View>

          <Text style={styles.lead}>Votre dossier est en file d&apos;attente</Text>
          <Text style={styles.leadSub}>
            Un administrateur vérifie vos informations et vos pièces jointes. Vous n&apos;avez rien d&apos;autre à faire pour
            l&apos;instant : cette page se met à jour automatiquement.
          </Text>

          <View style={styles.card} accessibilityRole="summary">
            <Text style={styles.cardTitle}>Étapes</Text>

            <View style={styles.timeline}>
              <TimelineStep
                state="done"
                icon="checkmark-circle"
                title="Dossier transmis"
                subtitle="Nous avons bien reçu votre candidature."
              />
              <TimelineStep
                state="current"
                icon="shield-checkmark-outline"
                title="Examen en cours"
                subtitle="Contrôle d'identité et des documents."
              />
              <TimelineStep
                state="upcoming"
                icon="rocket-outline"
                title="Activation"
                subtitle="Accès à l'app chauffeur dès validation."
                isLast
              />
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="sync-outline" size={16} color={Colors.primary} />
              <Text style={styles.metaChipText}>Vérif. auto toutes les {POLL_MS / 1000} s</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={16} color={Colors.gray} />
              <Text style={styles.metaChipTextMuted}>Dernière synchro · {lastCheckLabel}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.supportRow}
            onPress={openSupport}
            activeOpacity={0.85}
            accessibilityRole="link"
            accessibilityLabel="Contacter le support par WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={22} color="#128C7E" />
            <Text style={styles.supportText}>Une question sur votre dossier ? Écrivez-nous</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.mediumGray} />
          </TouchableOpacity>

          <View style={styles.infoBanner}>
            <Ionicons name="notifications-outline" size={22} color={Colors.primaryDark} />
            <Text style={styles.infoBannerText}>
              Pensez à autoriser les notifications : nous vous préviendrons dès que votre statut change.
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.refreshBtn, isChecking && styles.refreshBtnDisabled]}
            activeOpacity={0.88}
            onPress={handleRefresh}
            disabled={isChecking}
            accessibilityRole="button"
            accessibilityLabel="Rafraîchir le statut maintenant"
          >
            {isChecking ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Ionicons name="refresh" size={22} color={Colors.white} />
            )}
            <Text style={styles.refreshBtnText}>{isChecking ? 'Vérification…' : 'Vérifier maintenant'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

function TimelineStep(props: {
  state: 'done' | 'current' | 'upcoming';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  isLast?: boolean;
}) {
  const { state, icon, title, subtitle, isLast } = props;
  const circleColor =
    state === 'done' ? Colors.success : state === 'current' ? Colors.primary : Colors.border;
  const iconColor =
    state === 'done' ? Colors.white : state === 'current' ? Colors.white : Colors.mediumGray;

  return (
    <View style={styles.stepRow}>
      <View style={styles.stepRail}>
        <View style={[styles.stepDot, { backgroundColor: circleColor, borderColor: circleColor }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        {!isLast ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={styles.stepBody}>
        <Text style={[styles.stepTitle, state === 'upcoming' && styles.stepTitleMuted]}>{title}</Text>
        <Text style={styles.stepSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 20,
    color: Colors.black,
    letterSpacing: -0.3,
  },
  headerLink: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  headerLinkText: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 14,
    color: Colors.primary,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  heroRing: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 22,
    borderRadius: 999,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 18,
      },
      android: { elevation: 10 },
    }),
  },
  heroGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lead: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 22,
    color: Colors.black,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  leadSub: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 15,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  cardTitle: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 13,
    color: Colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
    marginLeft: 4,
  },
  timeline: {
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    minHeight: 72,
  },
  stepRail: {
    width: 36,
    alignItems: 'center',
  },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  stepLine: {
    width: 2,
    height: 28,
    marginVertical: 4,
    backgroundColor: Colors.border,
  },
  stepBody: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 18,
  },
  stepTitle: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 16,
    color: Colors.black,
    marginBottom: 4,
  },
  stepTitleMuted: {
    color: Colors.mediumGray,
  },
  stepSubtitle: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
    justifyContent: 'center',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metaChipText: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 12,
    color: Colors.primaryDark,
  },
  metaChipTextMuted: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 12,
    color: Colors.gray,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  supportText: {
    flex: 1,
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 14,
    color: Colors.black,
    lineHeight: 20,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(54, 80, 208, 0.08)',
  },
  infoBannerText: {
    flex: 1,
    fontFamily: Fonts.titilliumWeb,
    fontSize: 13,
    color: Colors.primaryDark,
    lineHeight: 19,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  refreshBtnDisabled: {
    opacity: 0.75,
  },
  refreshBtnText: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 16,
    color: Colors.white,
  },
});
