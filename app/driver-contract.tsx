import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { checkNetworkConnection } from './utils/networkHandler';
import { openExternalUrl } from './utils/openExternalUrl';
import { useDriverStore } from './providers/DriverProvider';
import { getAuthToken, removeAuthToken } from './utils/authTokenStorage';

const LEGAL_CGU = 'https://kekenon.com/cgu';
const LEGAL_PRIVACY = 'https://kekenon.com/confidentialite';

const KEY_POINTS: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  {
    icon: 'shield-checkmark-outline',
    text: 'Respect du code de conduite, sécurité des passagers et comportement professionnel.',
  },
  {
    icon: 'cash-outline',
    text: 'Conditions de rémunération, commissions et usage de la plateforme Kêkênon.',
  },
  {
    icon: 'lock-closed-outline',
    text: 'Traitement des données personnelles et confidentialité, conformément à la réglementation.',
  },
  {
    icon: 'document-text-outline',
    text: 'Respect des lois en vigueur et des normes de qualité du service.',
  },
];

export default function DriverContractScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useDriverStore();
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const checkAccepted = async () => {
      try {
        const token = await getAuthToken();
        if (!token || !getApiBaseUrl()) return;

        const res = await apiFetch('/driver/profile', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        const json = await res?.json().catch(() => null);
        if (res?.ok && json?.profile?.contract_accepted_at) {
          router.replace('/(tabs)');
          return;
        }
      } catch {
        /* ignore */
      }
    };

    void checkAccepted();
  }, [router]);

  const performDisconnect = useCallback(async () => {
    await removeAuthToken();
    await AsyncStorage.multiRemove(['authUser', 'hasSeenApprovalSuccess']);
    router.replace('/driver-onboarding');
  }, [router]);

  const confirmLeave = useCallback(() => {
    Alert.alert(
      'Quitter sans accepter ?',
      'Vous serez déconnecté. Pour signer plus tard, reconnectez-vous avec le même numéro.',
      [
        { text: 'Rester', style: 'cancel' },
        {
          text: 'Me déconnecter',
          style: 'destructive',
          onPress: () => void performDisconnect(),
        },
      ]
    );
  }, [performDisconnect]);

  const handleAccept = async () => {
    if (accepting) return;

    try {
      const net = await checkNetworkConnection();
      if (!net.isConnected) {
        Alert.alert('Connexion', 'Pas de connexion Internet. Vérifiez le réseau puis réessayez.');
        return;
      }
      if (net.isInternetReachable === false) {
        Alert.alert('Connexion', 'Connexion limitée. Réessayez dans un instant.');
        return;
      }
    } catch {
      Alert.alert('Connexion', 'Impossible de vérifier le réseau. Réessayez.');
      return;
    }

    try {
      setAccepting(true);
      const token = await getAuthToken();
      if (!token || !getApiBaseUrl()) {
        Alert.alert('Session', 'Session expirée. Reconnectez-vous.');
        return;
      }

      const res = await apiFetch('/driver/contract/accept', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      });

      if (res?.ok) {
        await refreshProfile();
        router.replace('/(tabs)');
        return;
      }

      const json = await res?.json().catch(() => null);
      const msg =
        (json && typeof json === 'object' && 'message' in json && typeof (json as { message: unknown }).message === 'string'
          ? (json as { message: string }).message
          : null) || 'Impossible de valider le contrat. Réessayez.';

      Alert.alert('Erreur', msg);
    } catch {
      Alert.alert('Erreur', 'Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient
        colors={['#E8ECFF', '#F2F5FF', Colors.background]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) - 8 }]}>
          <TouchableOpacity
            onPress={confirmLeave}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Quitter et se déconnecter"
          >
            <Ionicons name="chevron-back" size={26} color={Colors.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Contrat chauffeur
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroCard}>
            <LinearGradient colors={[...Gradients.primary]} style={styles.heroIcon}>
              <Ionicons name="document-text" size={32} color={Colors.white} />
            </LinearGradient>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroTitle}>Convention Kêkênon</Text>
              <Text style={styles.heroSub}>
                Dernière étape avant l&apos;accès au tableau de bord. Lisez les points essentiels puis acceptez.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Points clés</Text>
          <View style={styles.pointsCard}>
            {KEY_POINTS.map((item, index) => (
              <View
                key={index}
                style={[styles.pointRow, index < KEY_POINTS.length - 1 && styles.pointRowBorder]}
              >
                <View style={styles.pointIcon}>
                  <Ionicons name={item.icon} size={20} color={Colors.primary} />
                </View>
                <Text style={styles.pointText}>{item.text}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Engagement</Text>
          <View style={styles.legalCard}>
            <Text style={styles.legalParagraph}>
              En acceptant, vous confirmez avoir pris connaissance de cette convention et vous engagez à respecter les
              règles ci-dessus pour offrir un service conforme aux standards Kêkênon.
            </Text>
            <Text style={styles.legalParagraph}>
              Pour le détail juridique complet, consultez nos documents officiels.
            </Text>
            <View style={styles.linksRow}>
              <TouchableOpacity
                onPress={() => void openExternalUrl(LEGAL_CGU)}
                style={styles.linkChip}
                accessibilityRole="link"
                accessibilityLabel="Ouvrir les conditions générales d utilisation"
              >
                <Ionicons name="open-outline" size={16} color={Colors.primary} />
                <Text style={styles.linkChipText}>CGU</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void openExternalUrl(LEGAL_PRIVACY)}
                style={styles.linkChip}
                accessibilityRole="link"
                accessibilityLabel="Ouvrir la politique de confidentialité"
              >
                <Ionicons name="open-outline" size={16} color={Colors.primary} />
                <Text style={styles.linkChipText}>Confidentialité</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.scrollBottomSpacer} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.acceptBtn, accepting && styles.acceptBtnDisabled]}
            activeOpacity={0.88}
            onPress={() => void handleAccept()}
            disabled={accepting}
            accessibilityRole="button"
            accessibilityLabel="Accepter le contrat et accéder à l application"
          >
            {accepting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Text style={styles.acceptBtnText}>J&apos;accepte le contrat</Text>
                <Ionicons name="arrow-forward" size={22} color={Colors.white} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.85}
            onPress={confirmLeave}
            disabled={accepting}
            accessibilityRole="button"
            accessibilityLabel="Se déconnecter pour utiliser un autre numéro"
          >
            <Ionicons name="call-outline" size={18} color={Colors.primary} />
            <Text style={styles.secondaryBtnText}>Utiliser un autre numéro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backBtn: {
    padding: 4,
    width: 40,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 18,
    color: Colors.black,
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 12,
  },
  scrollBottomSpacer: {
    height: 8,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: {
    flex: 1,
  },
  heroTitle: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 17,
    color: Colors.black,
    marginBottom: 6,
  },
  heroSub: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 19,
  },
  sectionLabel: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 12,
    color: Colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    marginBottom: 10,
    marginLeft: 4,
  },
  pointsCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pointRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pointIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(54, 80, 208, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  pointText: {
    flex: 1,
    fontFamily: Fonts.titilliumWeb,
    fontSize: 14,
    color: Colors.black,
    lineHeight: 21,
  },
  legalCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  legalParagraph: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 22,
    marginBottom: 12,
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(54, 80, 208, 0.08)',
  },
  linkChipText: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 13,
    color: Colors.primaryDark,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 12,
  },
  acceptBtn: {
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
        shadowOpacity: 0.32,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  acceptBtnDisabled: {
    opacity: 0.75,
  },
  acceptBtnText: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 16,
    color: Colors.white,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  secondaryBtnText: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 14,
    color: Colors.primary,
  },
});
