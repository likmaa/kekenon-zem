import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { Ionicons } from "@expo/vector-icons";
import { getAuthToken, removeAuthToken } from './utils/authTokenStorage';

export default function DriverExistingDetailsScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkProfile = async () => {
      try {
        const token = await getAuthToken();
        if (!token || !getApiBaseUrl()) return;

        const res = await apiFetch('/driver/profile', {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        const json = await res?.json().catch(() => null);
        if (!res || !res.ok || !json) return;

        const user = json.user ?? {};
        const profile = json.profile ?? null;

        setFullName(user.name ?? '');
        setEmail(user.email ?? '');
        setPhone(user.phone ?? '');
        const status = profile?.status as string | undefined;
        if (status === "pending") {
          router.replace("/driver-pending-approval" as any);
          return;
        }

        if (status === "rejected") {
          router.replace("/driver-application-rejected" as any);
          return;
        }
      } catch { }
    };

    checkProfile();
  }, [router]);

  const validate = () => {
    if (!fullName.trim()) {
      setError("Merci de renseigner votre nom complet.");
      return false;
    }
    if (!phone.trim()) {
      setError("Merci de renseigner votre numéro de téléphone.");
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      setError(null);

      if (!getApiBaseUrl()) {
        setError("Configuration API manquante.");
        return;
      }

      const token = await getAuthToken();
      if (!token) {
        setError("Vous devez être connecté.");
        return;
      }

      const personalPayload: Record<string, string> = {
        name: fullName.trim(),
        phone: phone.trim(),
      };
      if (email.trim()) personalPayload.email = email.trim();

      const personalRes = await apiFetch('/auth/profile', {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(personalPayload),
      });

      if (!personalRes || !personalRes.ok) {
        const body = personalRes ? await personalRes.json().catch(() => null) : null;
        const msg = body?.message || "Impossible de mettre à jour vos informations personnelles.";
        setError(msg);
        Alert.alert("Erreur", msg);
        return;
      }


      // Update local storage so dashboard reflects changes immediately
      try {
        const storedUser = await AsyncStorage.getItem('authUser');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          parsedUser.name = fullName.trim();
          parsedUser.email = email.trim();
          parsedUser.phone = phone.trim();
          await AsyncStorage.setItem('authUser', JSON.stringify(parsedUser));
        }
      } catch (e) {
        // ignore storage error, worst case dashboard is stale
      }

      Alert.alert("Succès", "Vos informations ont été mises à jour.");
      router.back();
    } catch (e: any) {
      setError("Erreur réseau.");
      Alert.alert("Erreur", e?.message ?? "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Informations chauffeur</Text>
      </View>

      {/* CONTENT */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Compléter mes informations</Text>
        <Text style={styles.subtitle}>
          Ces informations sont nécessaires pour activer votre compte chauffeur.
        </Text>

        {/* INFORMATIONS PERSONNELLES */}
        <Text style={styles.sectionTitle}>Informations personnelles</Text>
        <Text style={styles.label}>Nom complet</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Jean Dupont"
          style={styles.input}
        />

        <Text style={styles.label}>Adresse e-mail</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="email@example.com"
          style={styles.input}
        />

        <Text style={styles.label}>Téléphone</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+229XXXXXXXX"
          style={styles.input}
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* BUTTON */}
        <TouchableOpacity
          onPress={submit}
          disabled={loading}
          style={styles.primaryButton}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryText}>
            {loading ? "Enregistrement..." : "Enregistrer"}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  backBtn: {
    padding: 5,
    marginRight: 8,
  },
  headerTitle: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 18,
    color: Colors.black,
  },

  content: {
    paddingHorizontal: 26,
    paddingTop: 20,
    paddingBottom: 40,
  },

  title: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 22,
    color: Colors.black,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 15,
    color: Colors.gray,
    marginBottom: 30,
  },

  sectionTitle: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 15,
    color: Colors.black,
    marginTop: 15,
    marginBottom: 8,
  },

  label: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 14,
    color: Colors.black,
    marginBottom: 5,
  },

  input: {
    borderWidth: 1,
    borderColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "white",
    fontFamily: Fonts.titilliumWeb,
    marginBottom: 14,
  },

  errorText: {
    color: "#B91C1C",
    marginBottom: 8,
  },

  primaryButton: {
    marginTop: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 5,
  },

  primaryText: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 16,
    color: "white",
  },
});
