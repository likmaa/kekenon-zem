import React from 'react';
import { SafeAreaView, StyleSheet, Text, View, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Fonts } from '../../../font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, getApiBaseUrl } from '../../utils/apiClient';
import { getAuthToken, removeAuthToken } from '../../utils/authTokenStorage';

export default function WithdrawScreen() {
  const router = useRouter();
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState<string | null>(null);
  const [accountIdentifier, setAccountIdentifier] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const methods = [
    { id: 'espece', label: 'Espèce', icon: 'cash-outline' },
    { id: 'momo', label: 'MoMo', icon: 'phone-portrait-outline' },
    { id: 'flooz', label: 'Flooz', icon: 'phone-portrait-outline' },
    { id: 'celtiis', label: 'Celtiis', icon: 'phone-portrait-outline' },
  ];

  const handleWithdraw = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) < 500) {
      setError('Veuillez entrer un montant valide (min. 500 FCFA).');
      return;
    }

    if (!method) {
      setError('Veuillez sélectionner un moyen de retrait.');
      return;
    }

    if (method !== 'espece' && !accountIdentifier) {
      setError('Veuillez entrer votre numéro de compte.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      if (!getApiBaseUrl()) {
        throw new Error('URL API non configurée.');
      }
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Connexion requise.');
      }

      const res = await apiFetch('/driver/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          amount: Number(amount),
          payment_method: method,
          account_identifier: method === 'espece' ? 'In-person' : accountIdentifier,
        }),
      });

      if (!res) {
        throw new Error('Impossible de contacter le serveur.');
      }
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.message || 'Erreur lors du retrait.');
      }

      Alert.alert(
        'Succès',
        json.message,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Retirer mes gains</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Montant (FCFA)</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="Ex: 5000"
          keyboardType="number-pad"
          style={styles.input}
          editable={!loading}
        />

        <Text style={[styles.label, { marginTop: 10 }]}>Moyen de retrait</Text>
        <View style={styles.methodsGrid}>
          {methods.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[
                styles.methodItem,
                method === m.id && styles.methodItemActive
              ]}
              onPress={() => setMethod(m.id)}
              disabled={loading}
            >
              <Text style={[
                styles.methodLabel,
                method === m.id && styles.methodLabelActive
              ]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {method && method !== 'espece' && (
          <View style={{ marginTop: 15 }}>
            <Text style={styles.label}>Numéro de téléphone / Compte</Text>
            <TextInput
              value={accountIdentifier}
              onChangeText={setAccountIdentifier}
              placeholder="Ex: 0102030405"
              keyboardType="phone-pad"
              style={styles.input}
              editable={!loading}
            />
          </View>
        )}

        {error && (
          <Text style={{ color: 'red', fontSize: 13, marginTop: 12, marginBottom: 12, fontFamily: Fonts.titilliumWeb }}>
            {error}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.primary, (loading || !method) && { opacity: 0.7 }, { marginTop: 20 }]}
          onPress={handleWithdraw}
          disabled={loading || !method}
        >
          <Text style={styles.primaryText}>{loading ? 'Traitement...' : 'Confirmer le retrait'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7F9', padding: 16 },
  header: { marginBottom: 10, paddingTop: 10 },
  title: { fontSize: 24, fontFamily: Fonts.titilliumWebBold, color: '#111' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  label: { color: '#666', marginBottom: 8, fontFamily: Fonts.titilliumWebBold, fontSize: 14 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 16, fontFamily: Fonts.titilliumWeb, backgroundColor: '#f9fafb' },
  methodsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 5 },
  methodItem: {
    flex: 1,
    minWidth: '45%',
    padding: 15,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  methodItemActive: {
    borderColor: '#111',
    backgroundColor: '#f3f4f6'
  },
  methodLabel: {
    fontFamily: Fonts.titilliumWebBold,
    color: '#666',
    fontSize: 15
  },
  methodLabelActive: {
    color: '#111'
  },
  primary: { backgroundColor: '#111827', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontFamily: Fonts.titilliumWebBold, fontSize: 16 },
});
