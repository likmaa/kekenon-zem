import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts } from '../../../font';
import { apiFetch, getApiBaseUrl } from '../../utils/apiClient';
import { getAuthToken } from '../../utils/authTokenStorage';

type WithdrawalMethod = 'espece' | 'momo' | 'flooz' | 'celtiis';

const METHODS: {
  id: WithdrawalMethod;
  label: string;
  hint: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { id: 'espece', label: 'Espèces', hint: 'Point Kêkênon', icon: 'cash' },
  { id: 'momo', label: 'MTN MoMo', hint: 'Mobile Money', icon: 'cellphone-check' },
  { id: 'flooz', label: 'Moov Money', hint: 'Flooz', icon: 'cellphone-check' },
  { id: 'celtiis', label: 'Celtiis', hint: 'Mobile Money', icon: 'cellphone-check' },
];

export default function WithdrawScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<WithdrawalMethod | null>(null);
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const response = await apiFetch('/driver/wallet');
      if (!response?.ok) return;
      const data = await response.json().catch(() => ({}));
      setBalance(Number(data.balance) || 0);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => { void loadBalance(); }, [loadBalance]);

  const amountNumber = Math.floor(Number(amount.replace(/\s/g, '').replace(',', '.')) || 0);
  const needsAccount = method != null && method !== 'espece';
  const validAmount = amountNumber >= 500 && amountNumber <= balance;
  const canSubmit = validAmount && method != null && (!needsAccount || accountIdentifier.trim().length >= 8) && !loading;

  const quickAmounts = useMemo(() => {
    if (balance < 500) return [];
    const values = [Math.floor(balance * 0.25), Math.floor(balance * 0.5), balance]
      .map((value) => Math.floor(value / 100) * 100)
      .filter((value) => value >= 500);
    return [...new Set(values)];
  }, [balance]);

  const handleWithdraw = async () => {
    if (!validAmount) {
      setError(amountNumber < 500 ? 'Le retrait minimum est de 500 FCFA.' : 'Ce montant dépasse votre solde disponible.');
      return;
    }
    if (!method) {
      setError('Sélectionnez une méthode de retrait.');
      return;
    }
    if (needsAccount && accountIdentifier.trim().length < 8) {
      setError('Entrez un numéro Mobile Money valide.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      if (!getApiBaseUrl() || !await getAuthToken()) throw new Error('Connexion requise.');

      const response = await apiFetch('/driver/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          amount: amountNumber,
          payment_method: method,
          account_identifier: method === 'espece' ? 'In-person' : accountIdentifier.trim(),
        }),
      });
      if (!response) throw new Error('Impossible de contacter le serveur.');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Erreur lors du retrait.');

      Alert.alert('Demande envoyée', data.message, [{ text: 'Terminer', onPress: () => router.back() }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={['#37BD6B', '#279C52']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + 14 }]}
          >
            <Image source={require('../../../assets/images/logo_cabin.png')} style={styles.watermark} resizeMode="contain" />
            <TouchableOpacity
              style={[styles.backButton, { top: insets.top + 14 }]}
              onPress={() => router.back()}
              hitSlop={10}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="bank-transfer-out" size={25} color="#FFFFFF" />
            </View>
            <Text style={styles.heroTitle}>Retirer mes gains</Text>
            <Text style={styles.balanceLabel}>Solde disponible</Text>
            {balanceLoading ? (
              <ActivityIndicator color="#FFFFFF" style={styles.balanceLoader} />
            ) : (
              <Text style={styles.balanceValue}>{balance.toLocaleString('fr-FR')} FCFA</Text>
            )}
          </LinearGradient>

          <View style={styles.content}>
            <View style={styles.amountCard}>
              <Text style={styles.sectionLabel}>Montant à retirer</Text>
              <View style={styles.amountRow}>
                <TextInput
                  value={amount}
                  onChangeText={(value) => { setAmount(value); setError(null); }}
                  placeholder="0"
                  placeholderTextColor="#B8C0BA"
                  keyboardType="number-pad"
                  style={styles.amountInput}
                  selectionColor="#279C52"
                  editable={!loading}
                />
                <Text style={styles.currency}>FCFA</Text>
              </View>
              <View style={styles.quickAmounts}>
                {quickAmounts.map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.quickChip, amountNumber === value && styles.quickChipActive]}
                    onPress={() => { setAmount(String(value)); setError(null); }}
                  >
                    <Text style={[styles.quickChipText, amountNumber === value && styles.quickChipTextActive]}>
                      {value === balance ? 'Tout' : value.toLocaleString('fr-FR')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.minimumText}>Minimum : 500 FCFA</Text>
            </View>

            <Text style={styles.methodsTitle}>Recevoir l’argent via</Text>
            <View style={styles.methodsGrid}>
              {METHODS.map((item) => {
                const active = method === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.methodCard, active && styles.methodCardActive]}
                    onPress={() => { setMethod(item.id); setError(null); }}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.methodIcon, active && styles.methodIconActive]}>
                      <MaterialCommunityIcons name={item.icon} size={22} color={active ? '#FFFFFF' : '#24914C'} />
                    </View>
                    <Text style={styles.methodLabel}>{item.label}</Text>
                    <Text style={styles.methodHint}>{item.hint}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={19} color="#2BA458" style={styles.methodCheck} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {needsAccount ? (
              <View style={styles.accountCard}>
                <Text style={styles.accountLabel}>Numéro Mobile Money</Text>
                <View style={styles.phoneRow}>
                  <Text style={styles.countryCode}>+229</Text>
                  <TextInput
                    value={accountIdentifier}
                    onChangeText={(value) => { setAccountIdentifier(value); setError(null); }}
                    placeholder="01 00 00 00 00"
                    placeholderTextColor="#A7B0AA"
                    keyboardType="phone-pad"
                    style={styles.phoneInput}
                    selectionColor="#279C52"
                    editable={!loading}
                  />
                </View>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={19} color="#C83D34" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.infoCard}>
              <Ionicons name="time-outline" size={18} color="#24914C" />
              <Text style={styles.infoText}>Votre demande sera enregistrée et traitée par l’équipe Kêkênon.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
          onPress={handleWithdraw}
          disabled={!canSubmit}
          activeOpacity={0.88}
        >
          {loading ? <ActivityIndicator color="#FFFFFF" /> : (
            <>
              <Text style={styles.primaryButtonText}>Confirmer le retrait</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#37BD6B' },
  flex: { flex: 1 },
  scrollView: { backgroundColor: '#EFF3F0' },
  scrollContent: { paddingBottom: 130 },
  hero: {
    position: 'relative', overflow: 'hidden', minHeight: 260, paddingHorizontal: 20, paddingBottom: 26,
    alignItems: 'center', borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
  },
  watermark: { position: 'absolute', right: -28, bottom: -48, width: 210, height: 210, opacity: 0.11, tintColor: '#FFFFFF' },
  backButton: {
    position: 'absolute', left: 20, width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroIcon: {
    width: 48, height: 48, marginTop: 7, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  heroTitle: { marginTop: 12, fontFamily: Fonts.bold, fontSize: 25, color: '#FFFFFF' },
  balanceLabel: { marginTop: 14, fontFamily: Fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  balanceValue: { marginTop: 1, fontFamily: Fonts.bold, fontSize: 28, color: '#FFFFFF' },
  balanceLoader: { marginTop: 8 },
  content: { width: '92%', maxWidth: 600, alignSelf: 'center', marginTop: -18 },
  amountCard: {
    padding: 18, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3EAE5',
    shadowColor: '#183D27', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
  },
  sectionLabel: { fontFamily: Fonts.bold, fontSize: 14, color: '#627067' },
  amountRow: {
    flexDirection: 'row', alignItems: 'baseline', marginTop: 6, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#E6ECE8',
  },
  amountInput: { flex: 1, minWidth: 0, paddingVertical: 0, fontFamily: Fonts.bold, fontSize: 42, lineHeight: 50, color: '#17251D' },
  currency: { marginLeft: 8, fontFamily: Fonts.bold, fontSize: 15, color: '#7E8982' },
  quickAmounts: { flexDirection: 'row', gap: 8, marginTop: 14 },
  quickChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, backgroundColor: '#F0F4F1' },
  quickChipActive: { backgroundColor: '#DFF2E5', borderWidth: 1, borderColor: '#A9DAB8' },
  quickChipText: { fontFamily: Fonts.bold, fontSize: 12, color: '#6D7971' },
  quickChipTextActive: { color: '#208344' },
  minimumText: { marginTop: 10, fontFamily: Fonts.regular, fontSize: 11, color: '#96A098' },
  methodsTitle: { marginTop: 21, marginBottom: 9, marginLeft: 2, fontFamily: Fonts.bold, fontSize: 15, color: '#24332A' },
  methodsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  methodCard: {
    position: 'relative', width: '48%', minHeight: 112, padding: 13, borderRadius: 18,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E9E5',
  },
  methodCardActive: { borderColor: '#77C78E', backgroundColor: '#F8FCF9' },
  methodIcon: { width: 36, height: 36, marginBottom: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF7EE' },
  methodIconActive: { backgroundColor: '#2BA458' },
  methodLabel: { fontFamily: Fonts.bold, fontSize: 14, color: '#26342B' },
  methodHint: { marginTop: 1, fontFamily: Fonts.regular, fontSize: 10, color: '#929B95' },
  methodCheck: { position: 'absolute', top: 11, right: 11 },
  accountCard: { marginTop: 13, padding: 15, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE6E0' },
  accountLabel: { marginBottom: 8, fontFamily: Fonts.bold, fontSize: 13, color: '#56635B' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 13, backgroundColor: '#F3F6F4' },
  countryCode: { paddingLeft: 13, paddingRight: 9, fontFamily: Fonts.bold, fontSize: 16, color: '#26342B' },
  phoneInput: { flex: 1, paddingHorizontal: 8, paddingVertical: 12, fontFamily: Fonts.medium, fontSize: 17, color: '#26342B' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13, padding: 12, borderRadius: 14, backgroundColor: '#FFF1F0' },
  errorText: { flex: 1, fontFamily: Fonts.medium, fontSize: 12, color: '#9D2D26' },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13, paddingHorizontal: 4 },
  infoText: { flex: 1, fontFamily: Fonts.regular, fontSize: 11, lineHeight: 15, color: '#7C8880' },
  footer: {
    paddingHorizontal: 20, paddingTop: 11, backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E3E9E5',
  },
  primaryButton: {
    minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    borderRadius: 17, backgroundColor: '#2BA458',
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { fontFamily: Fonts.bold, fontSize: 16, color: '#FFFFFF' },
});
