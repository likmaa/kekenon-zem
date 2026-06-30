import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { getAuthToken, removeAuthToken } from './utils/authTokenStorage';

export default function BecomeDriverScreen() {
  const router = useRouter();

  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('sedan');
  const [vehiclePhoto, setVehiclePhoto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!licenseNumber.trim() || !licensePlate.trim() || !vehicleMake.trim() || !vehicleModel.trim()) {
      setError('Veuillez renseigner le Droit Taxi, la plaque, la marque et le modèle.');
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!getApiBaseUrl()) {
      setError('URL API non configurée');
      return;
    }
    if (!validate()) return;

    try {
      setLoading(true);
      setError(null);

      const token = await getAuthToken();
      if (!token) {
        setError('Vous devez être connecté pour faire la demande.');
        return;
      }

      const res = await apiFetch('/driver/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          license_number: licenseNumber.trim(),
          vehicle_make: vehicleMake.trim(),
          vehicle_model: vehicleModel.trim(),
          vehicle_year: vehicleYear.trim(),
          vehicle_color: vehicleColor.trim(),
          license_plate: licensePlate.trim(),
          vehicle_type: vehicleType,
          photo: vehiclePhoto || null,
        }),
      });

      const json = await res?.json().catch(() => null);

      if (!res || !res.ok || !json) {
        const msg = json?.message || "Impossible d'envoyer la demande pour le moment.";
        setError(msg);
        Alert.alert('Erreur', msg);
        return;
      }

      Alert.alert(
        'Demande envoyée',
        "Votre demande de profil chauffeur est en cours de validation.",
        [
          {
            text: 'OK',
            onPress: () => {
              router.back();
            },
          },
        ],
      );
    } catch (e: any) {
      const msg = e?.message || 'Erreur réseau lors de la demande.';
      setError(msg);
      Alert.alert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <Text style={styles.headerTitle}>
        Devenir chauffeur Kêkênon
      </Text>
      <Text style={styles.headerSubtitle}>
        Complétez ces informations. Votre profil sera vérifié avant d’être activé.
      </Text>

      <Text style={styles.sectionTitle}>
        Informations administratives
      </Text>
      <Text style={styles.label}>Numéro de Droit Taxi *</Text>
      <TextInput
        value={licenseNumber}
        onChangeText={setLicenseNumber}
        placeholder="DROIT-TAXI-XXXX"
        autoCapitalize="characters"
        style={styles.input}
      />

      <Text style={styles.sectionTitle}>
        Informations véhicule
      </Text>

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.label}>Marque *</Text>
          <TextInput value={vehicleMake} onChangeText={setVehicleMake} placeholder="Toyota" style={styles.input} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Modèle *</Text>
          <TextInput value={vehicleModel} onChangeText={setVehicleModel} placeholder="Corolla" style={styles.input} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.label}>Couleur</Text>
          <TextInput value={vehicleColor} onChangeText={setVehicleColor} placeholder="Gris" style={styles.input} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Année</Text>
          <TextInput value={vehicleYear} onChangeText={setVehicleYear} placeholder="2018" keyboardType="numeric" style={styles.input} />
        </View>
      </View>

      <Text style={styles.label}>Numéro de plaque (immatriculation) *</Text>
      <TextInput
        value={licensePlate}
        onChangeText={setLicensePlate}
        placeholder="AA-1234-BB"
        autoCapitalize="characters"
        style={styles.input}
      />

      <Text style={styles.label}>Type de véhicule</Text>
      <View style={styles.typeSelector}>
        {['sedan', 'suv', 'van', 'compact'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.typeButton, vehicleType === type && styles.typeButtonActive]}
            onPress={() => setVehicleType(type)}
          >
            <Text style={[styles.typeButtonText, vehicleType === type && styles.typeButtonTextActive]}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Photo du véhicule (URL provisoire)</Text>
      <TextInput
        value={vehiclePhoto}
        onChangeText={setVehiclePhoto}
        placeholder="https://…"
        autoCapitalize="none"
        style={styles.input}
      />

      {error && (
        <Text style={styles.errorText}>
          {error}
        </Text>
      )}

      <TouchableOpacity
        onPress={submit}
        disabled={loading}
        style={[styles.submitButton, loading && { backgroundColor: Colors.mediumGray }]}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitButtonText}>
            Envoyer ma demande
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footerNote}>
        Après validation, vous verrez votre statut mis à jour et pourrez recevoir des courses.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerTitle: { fontFamily: Fonts.titilliumWebBold, fontSize: 24, color: Colors.black, marginBottom: 4 },
  headerSubtitle: { fontFamily: Fonts.titilliumWeb, fontSize: 14, color: Colors.gray, marginBottom: 24 },
  sectionTitle: { fontFamily: Fonts.titilliumWebBold, fontSize: 16, color: Colors.black, marginTop: 12, marginBottom: 12 },
  label: { fontFamily: Fonts.titilliumWeb, fontSize: 13, color: Colors.gray, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: Colors.lightGray,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: 'white',
    fontFamily: Fonts.titilliumWeb,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  errorText: { color: '#B91C1C', fontSize: 13, marginBottom: 12, fontFamily: Fonts.titilliumWeb },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  submitButtonText: { color: 'white', fontFamily: Fonts.titilliumWebBold, fontSize: 15 },
  footerNote: { fontSize: 12, color: Colors.gray, marginTop: 16, fontFamily: Fonts.titilliumWeb, textAlign: 'center' },
  typeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.lightGray },
  typeButtonActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeButtonText: { fontFamily: Fonts.titilliumWebBold, fontSize: 12, color: Colors.gray },
  typeButtonTextActive: { color: 'white' },
});
