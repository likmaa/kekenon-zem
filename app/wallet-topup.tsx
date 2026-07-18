import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MomoPaymentModal from './components/MomoPaymentModal';
import { MomoProvider } from './constants/momo';
import { useDriverStore } from './providers/DriverProvider';
import { apiFetchWithRetry, createIdempotencyKey, getApiBaseUrl } from './utils/apiClient';
import { getAuthToken } from './utils/authTokenStorage';
import { Fonts } from '../font';

const QUICK_AMOUNTS = [2000, 5000, 10000, 25000];
const MIN_TOPUP = 200;

export default function DriverWalletTopupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ minAmount?: string | string[] }>();
  const { driverProfile } = useDriverStore();

  const minNeeded = useMemo(() => {
    const raw = params.minAmount;
    const value = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
  }, [params.minAmount]);

  const minDisplay = minNeeded != null ? Math.max(minNeeded, MIN_TOPUP) : MIN_TOPUP;
  const [amount, setAmount] = useState(() => String(Math.max(minNeeded ?? 5000, MIN_TOPUP)));
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const topupIdemRef = useRef<string | null>(null);

  const amountNum = Math.floor(Number(amount.replace(/\s/g, '').replace(',', '.')) || 0);
  const isValid = amountNum >= minDisplay;

  const openModal = () => {
    if (!getApiBaseUrl()) {
      Alert.alert('Erreur', 'Configuration API manquante.');
      return;
    }
    if (!isValid) {
      Alert.alert('Montant', `Le montant minimum est ${minDisplay.toLocaleString('fr-FR')} FCFA.`);
      return;
    }
    setModalOpen(true);
  };

  const pollStatus = async (reference: string, bearer: string): Promise<'completed' | 'failed' | 'timeout'> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const response = await apiFetchWithRetry(`/driver/wallet/topup/${reference}/status`, {
        method: 'GET',
        bearerToken: bearer,
      });
      const data = await response?.json().catch(() => ({}));
      const status = (data as { status?: string })?.status;
      if (status === 'completed') return 'completed';
      if (status === 'failed') return 'failed';
    }
    return 'timeout';
  };

  const startTopup = async (phone: string, provider: MomoProvider) => {
    const bearer = (await getAuthToken())?.trim();
    if (!bearer) {
      Alert.alert('Connexion', 'Aucune session active. Reconnectez-vous pour continuer.');
      return;
    }

    setBusy(true);
    try {
      topupIdemRef.current = topupIdemRef.current ?? createIdempotencyKey(`driver-topup-${amountNum}`);
      const response = await apiFetchWithRetry('/driver/wallet/topup/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          phone,
          provider,
          idempotency_key: topupIdemRef.current,
        }),
        bearerToken: bearer,
      });
      const data = await response?.json().catch(() => ({}));

      if (!response?.ok) {
        Alert.alert(
          'Paiement',
          (data as { message?: string })?.message || 'Le paiement n’a pas pu être initié.',
        );
        return;
      }

      const reference = (data as { reference?: string })?.reference;
      if (!reference) {
        Alert.alert('Paiement', 'Référence de paiement manquante. Réessayez.');
        return;
      }

      Alert.alert(
        'Confirmez sur votre téléphone',
        'Validez la demande Mobile Money reçue pour créditer votre portefeuille.',
      );

      const outcome = await pollStatus(reference, bearer);
      if (outcome === 'completed') {
        topupIdemRef.current = null;
        setModalOpen(false);
        Alert.alert(
          'Rechargement réussi',
          `${amountNum.toLocaleString('fr-FR')} FCFA ont été ajoutés à votre portefeuille.`,
          [{ text: 'Terminer', onPress: () => router.back() }],
        );
      } else if (outcome === 'failed') {
        topupIdemRef.current = null;
        Alert.alert('Paiement échoué', 'Aucun montant n’a été débité.');
      } else {
        Alert.alert('En attente', 'La confirmation est encore en attente. Votre solde sera actualisé automatiquement.');
      }
    } catch {
      Alert.alert('Erreur', 'Une erreur est survenue. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={['#37BD6B', '#279C52']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + 14 }]}
          >
            <Image source={require('../assets/images/logo_cabin.png')} style={styles.watermark} resizeMode="contain" />
            <TouchableOpacity
              style={[styles.backButton, { top: insets.top + 14 }]}
              onPress={() => router.back()}
              hitSlop={10}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="wallet-plus-outline" size={25} color="#FFFFFF" />
            </View>
            <Text style={styles.heroTitle}>Recharger le portefeuille</Text>
            <Text style={styles.heroSub}>Ajoutez de l’argent avec votre compte Mobile Money.</Text>
          </LinearGradient>

          <View style={styles.content}>
            {minNeeded != null ? (
              <View style={styles.hintBox}>
                <Ionicons name="information-circle-outline" size={20} color="#24914C" />
                <Text style={styles.hintText}>
                  Minimum conseillé : {minDisplay.toLocaleString('fr-FR')} FCFA.
                </Text>
              </View>
            ) : null}

            <View style={styles.amountCard}>
              <Text style={styles.section}>Montant à ajouter</Text>
              <View style={styles.amountRow}>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#B8C0BA"
                  style={styles.amountInput}
                  selectionColor="#279C52"
                />
                <Text style={styles.currency}>FCFA</Text>
              </View>
              <View style={styles.chips}>
                {QUICK_AMOUNTS.map((value) => {
                  const selected = amountNum === Math.max(value, minDisplay);
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setAmount(String(Math.max(value, minDisplay)))}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {value.toLocaleString('fr-FR')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Text style={styles.paymentSectionTitle}>Mode de paiement</Text>
            <View style={styles.methodCard}>
              <View style={styles.methodIcon}>
                <MaterialCommunityIcons name="cellphone-check" size={23} color="#24914C" />
              </View>
              <View style={styles.methodText}>
                <Text style={styles.methodTitle}>Mobile Money</Text>
                <Text style={styles.methodSub}>MTN MoMo ou Moov Money</Text>
              </View>
              <View style={styles.selectedMethod}>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              </View>
            </View>
            <View style={styles.securityNote}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#24914C" />
              <Text style={styles.securityText}>Vous confirmerez le paiement directement sur votre téléphone.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.primaryButton, !isValid && styles.primaryButtonDisabled]}
          disabled={!isValid}
          onPress={openModal}
          activeOpacity={0.88}
        >
          <Text style={styles.primaryButtonText}>Continuer</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <MomoPaymentModal
        visible={modalOpen}
        amount={amountNum}
        busy={busy}
        defaultPhone={driverProfile?.phone ?? driverProfile?.user?.phone ?? undefined}
        title="Recharger par Mobile Money"
        onClose={() => { if (!busy) setModalOpen(false); }}
        onSubmit={startTopup}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#37BD6B' },
  flex: { flex: 1 },
  scrollView: { backgroundColor: '#EFF3F0' },
  scroll: { paddingBottom: 120 },
  hero: {
    position: 'relative', overflow: 'hidden', minHeight: 235, paddingHorizontal: 20, paddingBottom: 28,
    alignItems: 'center', borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
  },
  watermark: {
    position: 'absolute', right: -28, bottom: -45, width: 205, height: 205, opacity: 0.11, tintColor: '#FFFFFF',
  },
  backButton: {
    position: 'absolute', left: 20, width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroIcon: {
    width: 48, height: 48, marginTop: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  heroTitle: { marginTop: 13, fontFamily: Fonts.bold, fontSize: 25, color: '#FFFFFF', textAlign: 'center' },
  heroSub: {
    maxWidth: 310, marginTop: 5, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 18,
    color: 'rgba(255,255,255,0.76)', textAlign: 'center',
  },
  content: { width: '92%', maxWidth: 600, alignSelf: 'center', marginTop: -18 },
  hintBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, padding: 13,
    borderRadius: 16, backgroundColor: '#E5F5EA', borderWidth: 1, borderColor: '#CBE9D4',
  },
  hintText: { flex: 1, fontFamily: Fonts.medium, fontSize: 12, lineHeight: 17, color: '#356044' },
  amountCard: {
    padding: 18, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3EAE5',
    shadowColor: '#183D27', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
  },
  section: { fontFamily: Fonts.bold, fontSize: 14, color: '#627067' },
  amountRow: {
    flexDirection: 'row', alignItems: 'baseline', marginTop: 6, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#E6ECE8',
  },
  amountInput: {
    flex: 1, minWidth: 0, paddingVertical: 0, fontFamily: Fonts.bold, fontSize: 43, lineHeight: 50, color: '#17251D',
  },
  currency: { marginLeft: 8, fontFamily: Fonts.bold, fontSize: 15, color: '#7E8982' },
  chips: { flexDirection: 'row', gap: 7, marginTop: 15 },
  chip: {
    flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 5, paddingVertical: 9,
    borderRadius: 12, backgroundColor: '#F0F4F1',
  },
  chipSelected: { backgroundColor: '#DFF2E5', borderWidth: 1, borderColor: '#A9DAB8' },
  chipText: { fontFamily: Fonts.bold, fontSize: 12, color: '#6D7971' },
  chipTextSelected: { color: '#208344' },
  paymentSectionTitle: {
    marginTop: 22, marginBottom: 9, marginLeft: 2, fontFamily: Fonts.bold, fontSize: 15, color: '#24332A',
  },
  methodCard: {
    flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 19,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CFE7D6',
  },
  methodIcon: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF7EE',
  },
  methodText: { flex: 1, marginLeft: 12 },
  methodTitle: { fontFamily: Fonts.bold, fontSize: 15, color: '#213027' },
  methodSub: { marginTop: 2, fontFamily: Fonts.regular, fontSize: 12, color: '#8A958D' },
  selectedMethod: {
    width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2BA458',
  },
  securityNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 4 },
  securityText: { flex: 1, fontFamily: Fonts.regular, fontSize: 11, lineHeight: 15, color: '#7C8880' },
  footer: {
    paddingHorizontal: 20, paddingTop: 11, backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E3E9E5',
  },
  primaryButton: {
    minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    borderRadius: 17, backgroundColor: '#2BA458',
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { fontFamily: Fonts.bold, fontSize: 16, color: '#FFFFFF' },
});
