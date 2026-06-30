import React from 'react';
import { SafeAreaView, StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme';
import { Fonts } from '../font';

export default function CompleteRideLegacy() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const amount = params.fare ? parseFloat(params.fare as string) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.successIconContainer}>
          <MaterialCommunityIcons name="check-circle" size={80} color="#10B981" />
        </View>

        <Text style={styles.mainTitle}>Course terminée !</Text>
        <Text style={styles.subTitle}>Merci pour votre travail.</Text>

        <View style={styles.card}>
          <View style={styles.earningsRow}>
            <Text style={styles.label}>MONTANT Reçu</Text>
            <Text style={styles.amountValue}>{amount.toLocaleString('fr-FR')} FCFA</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.otherStats}>
            <View style={styles.statBox}>
              <MaterialCommunityIcons name="hand-coin" size={24} color="#D97706" />
              <Text style={styles.statLabel}>Pourboire</Text>
              <Text style={styles.statValue}>0 F</Text>
            </View>

            <View style={styles.verticalDivider} />

            <View style={styles.statBox}>
              <MaterialCommunityIcons name="star" size={24} color="#0EA5E9" />
              <Text style={styles.statLabel}>Note reçue</Text>
              <Text style={styles.statValue}>5.0</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.primaryBtnText}>Retour au tableau de bord</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.white} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 24, paddingVertical: 60, alignItems: 'center' },
  successIconContainer: { marginBottom: 20 },
  mainTitle: { fontSize: 24, fontFamily: Fonts.titilliumWebBold, color: Colors.black, textAlign: 'center', marginBottom: 8 },
  subTitle: { fontSize: 16, fontFamily: Fonts.titilliumWeb, color: Colors.gray, textAlign: 'center', marginBottom: 32 },

  card: { backgroundColor: '#F8FAFC', borderRadius: 24, padding: 24, width: '100%', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 32 },
  earningsRow: { alignItems: 'center', marginBottom: 20 },
  label: { fontSize: 11, fontFamily: Fonts.titilliumWebBold, color: Colors.gray, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  amountValue: { fontSize: 32, fontFamily: Fonts.titilliumWebBold, color: Colors.primary },

  divider: { height: 1, backgroundColor: '#E2E8F0', marginBottom: 20, borderStyle: 'dashed', borderRadius: 1 },

  otherStats: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statBox: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 11, fontFamily: Fonts.titilliumWebSemiBold, color: Colors.gray, marginTop: 4 },
  statValue: { fontSize: 18, fontFamily: Fonts.titilliumWebBold, color: Colors.black, marginTop: 2 },

  verticalDivider: { width: 1, height: 40, backgroundColor: '#E2E8F0' },

  primaryBtn: { backgroundColor: Colors.black, width: '100%', borderRadius: 16, height: 60, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  primaryBtnText: { color: Colors.white, fontSize: 16, fontFamily: Fonts.titilliumWebBold },
});
