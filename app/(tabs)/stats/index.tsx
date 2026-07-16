// screens/driver/StatsScreen.tsx
import React, { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../../../theme';
import { Fonts } from '../../../font';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, getApiBaseUrl } from '../../utils/apiClient';
import { getAuthToken, removeAuthToken } from '../../utils/authTokenStorage';

type Period = 'week' | 'month';

type DriverStatsResponse = {
  driver_id: number;
  total_rides: number;
  total_earnings: number;
  currency: string;
  range: {
    from: string | null;
    to: string | null;
  };
  rating_average: number | null;
  rating_count: number;
  acceptance_rate: number; // en pourcentage 0-100
  cancellation_rate: number; // en pourcentage 0-100
  online_hours: number | null;
};

// Composant pour la jauge circulaire
const StatGauge = ({ value, total, label, color, size = 80 }: { value: number, total: number, label: string, color: string, size?: number }) => {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / total) * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Colors.lightGray}
          strokeWidth={8}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={8}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.gaugeLabel}>
        <Text style={[styles.gaugeValue, { color }]}>{label}</Text>
      </View>
    </View>
  );
};

export default function DriverStatsScreen() {
  const [period, setPeriod] = useState<Period>('week');
  const [backendStats, setBackendStats] = useState<DriverStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!getApiBaseUrl()) return;
        setLoading(true);
        setError(null);

        const token = await getAuthToken();
        if (!token) {
          setError("Connexion requise pour charger vos statistiques.");
          return;
        }

        // Calcule la plage de dates en fonction de la période sélectionnée
        const now = new Date();
        let fromDate: Date;
        let toDate: Date;

        if (period === 'week') {
          // Semaine calendaire : lundi -> dimanche de la semaine actuelle
          const day = now.getDay(); // 0 = dimanche, 1 = lundi, ...
          const diffToMonday = (day + 6) % 7; // nombre de jours à remonter pour arriver au lundi
          fromDate = new Date(now);
          fromDate.setDate(now.getDate() - diffToMonday);

          toDate = new Date(fromDate);
          toDate.setDate(fromDate.getDate() + 6); // dimanche de la même semaine
        } else {
          // Mois calendaire courant
          fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
          toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // dernier jour du mois
        }

        const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
        const fromStr = `${fromDate.getFullYear()}-${pad(fromDate.getMonth() + 1)}-${pad(fromDate.getDate())} 00:00:00`;
        const toStr = `${toDate.getFullYear()}-${pad(toDate.getMonth() + 1)}-${pad(toDate.getDate())} 23:59:59`;

        const res = await apiFetch(
          `/driver/stats?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        );

        if (!res || !res.ok) {
          const body = res ? await res.json().catch(() => null) : null;
          const msg = body?.message || 'Impossible de charger vos statistiques.';
          setError(msg);
          return;
        }

        const json = (await res.json()) as DriverStatsResponse;
        if (!cancelled) {
          setBackendStats(json);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError('Erreur réseau lors du chargement de vos statistiques.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period]);

  const totalRides = backendStats?.total_rides ?? 0;
  const totalEarnings = backendStats?.total_earnings ?? 0;
  const currency = backendStats?.currency ?? 'FCFA';

  const ratingAverage = backendStats?.rating_average ?? 0;
  const acceptanceRate = backendStats?.acceptance_rate ?? 0;
  const cancellationRate = backendStats?.cancellation_rate ?? 0;
  const onlineHours = backendStats?.online_hours ?? 0;

  const data = {
    rating: ratingAverage,
    acceptanceRate,
    cancellationRate,
    onlineHours,
    totalRides,
    totalEarnings,
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Performances</Text>
        {/* Sélecteur de période */}
        <View style={styles.periodSelector}>
          <TouchableOpacity
            style={[styles.periodButton, period === 'week' && styles.periodButtonActive]}
            onPress={() => setPeriod('week')}
          >
            <Text style={[styles.periodText, period === 'week' && styles.periodTextActive]}>Semaine</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodButton, period === 'month' && styles.periodButtonActive]}
            onPress={() => setPeriod('month')}
          >
            <Text style={[styles.periodText, period === 'month' && styles.periodTextActive]}>Mois</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading && (
          <Text style={{ fontFamily: Fonts.regular, fontSize: 14, color: Colors.gray, marginBottom: 12 }}>
            Chargement de vos statistiques...
          </Text>
        )}
        {error && (
          <Text style={{ fontFamily: Fonts.regular, fontSize: 14, color: 'red', marginBottom: 12 }}>
            {error}
          </Text>
        )}

        {/* Carte de la Note Moyenne */}
        <View style={[styles.card, styles.ratingCard]}>
          <Text style={styles.ratingLabel}>Votre note moyenne</Text>
          <View style={styles.ratingValueContainer}>
            <MaterialCommunityIcons name="star" size={32} color="#FFC107" />
            <Text style={styles.ratingValue}>{data.rating.toFixed(2)}</Text>
          </View>
          <Text style={styles.ratingSubtext}>Basée sur vos 100 dernières courses</Text>
        </View>

        {/* Cartes des Taux */}
        <View style={styles.ratesRow}>
          <View style={styles.statGaugeCard}>
            <StatGauge value={data.acceptanceRate} total={100} label={`${data.acceptanceRate}%`} color="#4CAF50" />
            <Text style={styles.statLabel}>Taux d'acceptation</Text>
          </View>
          <View style={styles.statGaugeCard}>
            <StatGauge value={data.cancellationRate} total={100} label={`${data.cancellationRate}%`} color="#F44336" />
            <Text style={styles.statLabel}>Taux d'annulation</Text>
          </View>
        </View>

        {/* Carte des Statistiques d'Activité */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Résumé de l'activité</Text>
          <View style={styles.statRow}>
            <MaterialCommunityIcons name="clock-time-eight-outline" size={24} color={Colors.primary} />
            <Text style={styles.statText}>Heures en ligne</Text>
            <Text style={styles.statValue}>{data.onlineHours.toFixed(1)}h</Text>
          </View>
          <View style={styles.statRow}>
            <MaterialCommunityIcons name="car-multiple" size={24} color={Colors.primary} />
            <Text style={styles.statText}>Courses terminées</Text>
            <Text style={styles.statValue}>{data.totalRides}</Text>
          </View>
          <View style={styles.statRow}>
            <MaterialCommunityIcons name="cash-multiple" size={24} color={Colors.primary} />
            <Text style={styles.statText}>Gains bruts</Text>
            <Text style={styles.statValue}>
              {data.totalEarnings.toLocaleString('fr-FR')} {currency}
            </Text>
          </View>
        </View>
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
    padding: 20,
    paddingBottom: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    color: Colors.black,
    marginBottom: 16,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: 'white',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  periodText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: Colors.gray,
  },
  periodTextActive: {
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  ratingCard: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  ratingLabel: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  ratingValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  ratingValue: {
    fontFamily: Fonts.bold,
    fontSize: 48,
    color: 'white',
    marginLeft: 8,
  },
  ratingSubtext: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  ratesRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  statGaugeCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  gaugeLabel: {
    position: 'absolute',
  },
  gaugeValue: {
    fontFamily: Fonts.bold,
    fontSize: 18,
  },
  statLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.black,
    marginTop: 12,
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.black,
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  statText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 16,
    color: Colors.black,
    marginLeft: 16,
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.black,
  },
});
