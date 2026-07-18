// screens/driver/StatsScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../../theme';
import { Fonts } from '../../../font';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, getApiBaseUrl } from '../../utils/apiClient';
import { getAuthToken } from '../../utils/authTokenStorage';

type Period = 'day' | 'week' | 'month';

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
  const progress = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  const strokeDashoffset = circumference - progress * circumference;

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('day');
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

        if (period === 'day') {
          // Aujourd'hui
          fromDate = new Date(now);
          toDate = new Date(now);
        } else if (period === 'week') {
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
      } catch {
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
  const ratingCount = backendStats?.rating_count ?? 0;
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

  const periodLabel = period === 'day' ? "aujourd'hui" : period === 'week' ? 'cette semaine' : 'ce mois';
  const reviewLabel = ratingCount === 0
    ? 'Aucun avis reçu pour le moment'
    : `Basée sur ${ratingCount} avis`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[Colors.primary, '#FFC928', Colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 14 }]}
        >
          <Image
            source={require('../../../assets/images/logo_cabin.png')}
            style={styles.watermark}
            resizeMode="contain"
          />

          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroEyebrow}>Votre activité</Text>
              <Text style={styles.heroTitle}>Performances</Text>
            </View>
            <TouchableOpacity
              style={styles.historyButton}
              onPress={() => router.push('/historique')}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Voir l'historique des courses"
            >
              <MaterialCommunityIcons name="history" size={21} color={Colors.dark} />
              <Text style={styles.historyButtonText}>Historique</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heroMetricLabel}>Gains {periodLabel}</Text>
          <Text style={styles.heroMetric}>
            {data.totalEarnings.toLocaleString('fr-FR')}
            <Text style={styles.heroCurrency}> {currency}</Text>
          </Text>

          <View style={styles.heroHighlights}>
            <View style={styles.heroPill}>
              <MaterialCommunityIcons name="motorbike" size={18} color={Colors.dark} />
              <Text style={styles.heroPillText}>{data.totalRides} course{data.totalRides > 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.heroPill}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={Colors.dark} />
              <Text style={styles.heroPillText}>{data.onlineHours.toFixed(1)} h en ligne</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.periodSelector}>
            {([
              ['day', 'Jour'],
              ['week', 'Semaine'],
              ['month', 'Mois'],
            ] as const).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[styles.periodButton, period === value && styles.periodButtonActive]}
                onPress={() => setPeriod(value)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: period === value }}
              >
                <Text style={[styles.periodText, period === value && styles.periodTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading && (
            <View style={styles.feedbackCard}>
              <ActivityIndicator size="small" color={Colors.primaryDark} />
              <Text style={styles.feedbackText}>Chargement de vos statistiques...</Text>
            </View>
          )}
          {error && !loading && (
            <View style={[styles.feedbackCard, styles.errorCard]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={22} color={Colors.error} />
              <Text style={[styles.feedbackText, styles.errorText]}>{error}</Text>
            </View>
          )}

          <View style={styles.ratingCard}>
            <View style={styles.ratingIcon}>
              <MaterialCommunityIcons name="star" size={30} color={Colors.dark} />
            </View>
            <View style={styles.ratingCopy}>
              <Text style={styles.ratingLabel}>Votre note moyenne</Text>
              <Text style={styles.ratingSubtext}>{reviewLabel}</Text>
            </View>
            <Text style={styles.ratingValue}>{data.rating.toFixed(2)}</Text>
          </View>

          <Text style={styles.sectionTitle}>Qualité de service</Text>
          <View style={styles.ratesRow}>
            <View style={styles.statGaugeCard}>
              <StatGauge
                value={data.acceptanceRate}
                total={100}
                label={`${data.acceptanceRate.toFixed(0)}%`}
                color={Colors.success}
                size={88}
              />
              <Text style={styles.statLabel}>Taux d'acceptation</Text>
              <Text style={styles.statHint}>Courses acceptées</Text>
            </View>
            <View style={styles.statGaugeCard}>
              <StatGauge
                value={data.cancellationRate}
                total={100}
                label={`${data.cancellationRate.toFixed(0)}%`}
                color={Colors.error}
                size={88}
              />
              <Text style={styles.statLabel}>Taux d'annulation</Text>
              <Text style={styles.statHint}>Courses annulées</Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryHeading}>
              <Text style={styles.sectionTitle}>Résumé de l'activité</Text>
              <View style={styles.summaryBadge}>
                <Text style={styles.summaryBadgeText}>{periodLabel}</Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statIcon}>
                <MaterialCommunityIcons name="clock-time-eight-outline" size={21} color={Colors.dark} />
              </View>
              <Text style={styles.statText}>Heures en ligne</Text>
              <Text style={styles.statValue}>{data.onlineHours.toFixed(1)} h</Text>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statIcon}>
                <MaterialCommunityIcons name="motorbike" size={21} color={Colors.dark} />
              </View>
              <Text style={styles.statText}>Courses terminées</Text>
              <Text style={styles.statValue}>{data.totalRides}</Text>
            </View>
            <View style={[styles.statRow, styles.statRowLast]}>
              <View style={styles.statIcon}>
                <MaterialCommunityIcons name="cash-multiple" size={21} color={Colors.dark} />
              </View>
              <Text style={styles.statText}>Gains bruts</Text>
              <Text style={styles.statValue}>
                {data.totalEarnings.toLocaleString('fr-FR')} {currency}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F3E9',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 116,
  },
  hero: {
    minHeight: 290,
    paddingHorizontal: 22,
    paddingBottom: 42,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    width: 280,
    height: 280,
    right: -74,
    bottom: -76,
    opacity: 0.08,
    tintColor: Colors.dark,
    transform: [{ rotate: '-10deg' }],
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: 'rgba(26, 26, 26, 0.62)',
  },
  heroTitle: {
    marginTop: 2,
    fontFamily: Fonts.bold,
    fontSize: 30,
    lineHeight: 35,
    color: Colors.dark,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.52)',
  },
  historyButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.dark,
  },
  heroMetricLabel: {
    marginTop: 30,
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: 'rgba(26, 26, 26, 0.64)',
  },
  heroMetric: {
    marginTop: 2,
    fontFamily: Fonts.bold,
    fontSize: 38,
    lineHeight: 44,
    color: Colors.dark,
  },
  heroCurrency: {
    fontFamily: Fonts.semiBold,
    fontSize: 20,
  },
  heroHighlights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 20,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  heroPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.dark,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 18,
  },
  periodSelector: {
    flexDirection: 'row',
    marginTop: -24,
    marginBottom: 18,
    padding: 5,
    borderRadius: 18,
    backgroundColor: Colors.white,
    shadowColor: '#2B2100',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 13,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: Colors.dark,
  },
  periodText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: '#77736A',
  },
  periodTextActive: {
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  feedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: '#FFF8D8',
  },
  feedbackText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: '#645A31',
  },
  errorCard: {
    backgroundColor: '#FFF0EE',
  },
  errorText: {
    color: '#8F302A',
  },
  ratingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    marginBottom: 22,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#EEE9DC',
    shadowColor: '#493B13',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  ratingIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  ratingCopy: {
    flex: 1,
    marginHorizontal: 13,
  },
  ratingLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  ratingValue: {
    fontFamily: Fonts.bold,
    fontSize: 31,
    color: Colors.dark,
  },
  ratingSubtext: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: '#888277',
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 19,
    color: Colors.dark,
  },
  ratesRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 11,
    marginBottom: 22,
  },
  statGaugeCard: {
    flex: 1,
    alignItems: 'center',
    minHeight: 182,
    paddingHorizontal: 10,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#EEE9DC',
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
    color: Colors.dark,
    marginTop: 10,
    textAlign: 'center',
  },
  statHint: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: '#969087',
    textAlign: 'center',
  },
  summaryCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#EEE9DC',
  },
  summaryHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  summaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFF6C4',
  },
  summaryBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: '#6C5810',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDE4',
  },
  statRowLast: {
    borderBottomWidth: 0,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4B9',
  },
  statText: {
    flex: 1,
    marginLeft: 12,
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: '#59564F',
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.dark,
    textAlign: 'right',
  },
});
