import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  Dimensions,
} from 'react-native';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Gradients } from '../theme';
import { Fonts } from '../font';
import { Ionicons } from '@expo/vector-icons';

const { height: WIN_H } = Dimensions.get('window');

/** Dégradé plein écran : bleu projet (clair → primary → primaryDark). */
const GRADIENT_STOPS = ['#6B82ED', Gradients.primary[0], Gradients.primary[1]] as const;

const REASONS = [
  {
    icon: 'navigate' as const,
    title: 'Courses à proximité',
    text: 'Demandes autour de vous en temps réel.',
  },
  {
    icon: 'map-outline' as const,
    title: 'Navigation & trajets',
    text: 'Itinéraires et durées estimées.',
  },
  {
    icon: 'shield-checkmark' as const,
    title: 'Sécurité',
    text: 'Suivi de la prise en charge et de la course.',
  },
];

export default function DriverLocationPermissionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/driver-onboarding');
    }
  }, [router]);

  /** Saut de l’intro « Connexion chauffeur » : saisie du numéro puis OTP. */
  const goPhoneLogin = useCallback(() => {
    router.push('/driver-phone-login');
  }, [router]);

  const openOsSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const runPermissionRequest = useCallback(async () => {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status === 'granted') {
      goPhoneLogin();
      return;
    }

    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();

    if (status === 'granted') {
      goPhoneLogin();
      return;
    }

    const message = canAskAgain
      ? 'Sans position, vous ne recevrez pas les demandes autour de vous. Vous pourrez activer la localisation plus tard dans les réglages.'
      : 'L’accès a été refusé. Ouvrez les réglages de l’appareil pour autoriser la localisation pour Kêkênon.';

    Alert.alert('Localisation', message, [
      { text: 'Plus tard', style: 'cancel', onPress: goPhoneLogin },
      ...(canAskAgain ? [{ text: 'Réessayer', onPress: () => void runPermissionRequest() }] : []),
      { text: 'Réglages', onPress: openOsSettings },
    ]);
  }, [goPhoneLogin, openOsSettings]);

  const handleContinue = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runPermissionRequest();
    } catch {
      Alert.alert('Erreur', 'Impossible de demander la localisation. Réessayez ou ouvrez les réglages.', [
        { text: 'OK', onPress: goPhoneLogin },
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, goPhoneLogin, runPermissionRequest]);

  const handleSkip = useCallback(() => {
    Alert.alert(
      'Continuer sans localisation ?',
      'Vous pourrez l’activer plus tard dans les réglages du téléphone. Certaines fonctions seront limitées tant que la position n’est pas autorisée.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Continuer', style: 'destructive', onPress: goPhoneLogin },
      ],
    );
  }, [goPhoneLogin]);

  const decorPadTop = Math.min(insets.top + 48, WIN_H * 0.1);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.column,
          {
            paddingTop: insets.top + 6,
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={goBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>

        <View style={styles.middle}>
          <View style={styles.hero}>
            <View style={styles.pinWrap}>
              <LinearGradient
                colors={[Gradients.primary[0], Gradients.primary[1]]}
                style={styles.pinGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="location" size={30} color={Colors.white} />
              </LinearGradient>
            </View>
            <Text style={styles.kicker} numberOfLines={1}>
              Étape indispensable
            </Text>
            <Text style={styles.title} numberOfLines={2}>
              Activer la localisation
            </Text>
            <Text style={styles.subtitle} numberOfLines={3}>
              Pour les demandes à proximité et vos trajets, l’app accède à votre position pendant l’utilisation.
            </Text>
          </View>

          <View style={styles.blockLower}>
            <Text style={styles.sectionLabel} numberOfLines={1}>
              Pourquoi nous en avons besoin
            </Text>
            {REASONS.map((r) => (
              <View key={r.title} style={styles.reasonCard}>
                <View style={styles.reasonIcon}>
                  <Ionicons name={r.icon} size={17} color="#1A1A1A" />
                </View>
                <View style={styles.reasonTextCol}>
                  <Text style={styles.reasonTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.reasonBody} numberOfLines={2}>
                    {r.text}
                  </Text>
                </View>
              </View>
            ))}
            <View style={styles.noteRow}>
              <Ionicons name="information-circle-outline" size={15} color="#9E9E9E" />
              <Text style={styles.note} numberOfLines={2}>
                Position au premier plan uniquement (sauf si vous activez le suivi en arrière-plan plus tard).
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.ctaPrimary, busy && styles.ctaDisabled]}
            activeOpacity={0.88}
            onPress={() => void handleContinue()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Autoriser la localisation"
          >
            <Text style={styles.ctaPrimaryText} numberOfLines={1}>
              {busy ? 'Patientez…' : 'Autoriser la localisation'}
            </Text>
            <Ionicons name="location-outline" size={20} color="#1A1A1A" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaGhost} activeOpacity={0.85} onPress={handleSkip} accessibilityRole="button">
            <Text style={styles.ctaGhostText}>Plus tard</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  column: {
    flex: 1,
    paddingHorizontal: 20,
    zIndex: 2,
  },
  backBtn: {
    alignSelf: 'flex-start',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 6,
  },
  middle: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  hero: {
    alignItems: 'center',
  },
  pinWrap: {
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primaryDark,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
    }),
  },
  pinGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontFamily: Fonts.semiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: '#757575',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    lineHeight: 26,
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.4,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: '#616161',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  blockLower: {
    width: '100%',
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: '#757575',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    marginBottom: 6,
  },
  reasonIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  reasonTextCol: {
    flex: 1,
    minWidth: 0,
  },
  reasonTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: '#1A1A1A',
    marginBottom: 2,
  },
  reasonBody: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 15,
    color: '#616161',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6,
    paddingRight: 2,
  },
  note: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: '#9E9E9E',
    minWidth: 0,
  },
  footer: {
    paddingTop: 10,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  ctaPrimary: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopRightRadius: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  ctaDisabled: {
    opacity: 0.65,
  },
  ctaPrimaryText: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: '#1A1A1A',
    flexShrink: 1,
  },
  ctaGhost: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  ctaGhostText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: '#757575',
  },
});
