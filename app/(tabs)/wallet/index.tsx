// screens/driver/WalletScreen.tsx
import React, { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../../theme';
import { Fonts } from '../../../font';
import { apiFetch, getApiBaseUrl } from '../../utils/apiClient';
import { getAuthToken, removeAuthToken } from '../../utils/authTokenStorage';

// Données mock pour l'exemple
const walletData = {
  balance: 0,
  dailyEarnings: 0,
  weeklyEarnings: 0,
  last7Days: [
    { day: 'Lun', earnings: 0 },
    { day: 'Mar', earnings: 0 },
    { day: 'Mer', earnings: 0 },
    { day: 'Jeu', earnings: 0 },
    { day: 'Ven', earnings: 0 },
    { day: 'Sam', earnings: 0 },
    { day: 'Dim', earnings: 0 },
  ],
  transactions: [] as { id: string; type: 'ride' | 'bonus' | 'withdrawal'; description: string; amount: number; time: string }[],
};

// Helper pour le style des transactions
const getTxStyle = (type: 'ride' | 'bonus' | 'withdrawal') => {
  switch (type) {
    case 'ride':
      return { icon: 'car-clock', color: Colors.primary };
    case 'bonus':
      // Bonus mis en avant avec la couleur secondaire de la charte
      return { icon: 'star-circle', color: Colors.secondary };
    case 'withdrawal':
      return { icon: 'bank-transfer-out', color: '#F44336' };
    default:
      return { icon: 'help-circle', color: Colors.gray };
  }
};

export default function DriverWalletScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('FCFA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyEarnings, setDailyEarnings] = useState<number | null>(null);
  const [weeklyEarnings, setWeeklyEarnings] = useState<number | null>(null);
  const [last7DaysDynamic, setLast7DaysDynamic] = useState<typeof walletData.last7Days | null>(null);
  const [todayTransactions, setTodayTransactions] = useState<typeof walletData.transactions | null>(null);

  const maxEarningSource = last7DaysDynamic ?? walletData.last7Days;
  const maxEarning = Math.max(...maxEarningSource.map(d => d.earnings), 1); // Évite la division par zéro

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!getApiBaseUrl()) return;
      try {
        setLoading(true);
        setError(null);
        const token = await getAuthToken();
        if (!token) {
          setError("Connexion requise pour charger votre portefeuille.");
          return;
        }

        const res = await apiFetch('/driver/wallet', {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!res || !res.ok) {
          const body = res ? await res.json().catch(() => null) : null;
          const msg = body?.message || "Impossible de charger votre portefeuille.";
          setError(msg);
          return;
        }

        const json = await res.json();
        if (!cancelled) {
          setBalance(typeof json.balance === 'number' ? json.balance : null);
          if (json.currency) {
            setCurrency(json.currency);
          }
        }

        // Charger les gains du jour et de la semaine depuis /driver/stats
        const now = new Date();
        const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

        // Aujourd'hui
        const y = now.getFullYear();
        const m = pad(now.getMonth() + 1);
        const d = pad(now.getDate());
        const fromToday = `${y}-${m}-${d} 00:00:00`;
        const toToday = `${y}-${m}-${d} 23:59:59`;

        const statsTodayRes = await apiFetch(
          `/driver/stats?from=${encodeURIComponent(fromToday)}&to=${encodeURIComponent(toToday)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );
        if (statsTodayRes?.ok && !cancelled) {
          const statsToday = await statsTodayRes.json();
          if (typeof statsToday.total_earnings === 'number') {
            setDailyEarnings(statsToday.total_earnings);
          }
        }

        // Semaine calendaire actuelle (lundi -> dimanche)
        const day = now.getDay(); // 0 = dimanche, 1 = lundi, ...
        const diffToMonday = (day + 6) % 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - diffToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const fromWeek = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())} 00:00:00`;
        const toWeek = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())} 23:59:59`;

        const statsWeekRes = await apiFetch(
          `/driver/stats?from=${encodeURIComponent(fromWeek)}&to=${encodeURIComponent(toWeek)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );
        if (statsWeekRes?.ok && !cancelled) {
          const statsWeek = await statsWeekRes.json();
          if (typeof statsWeek.total_earnings === 'number') {
            setWeeklyEarnings(statsWeek.total_earnings);
          }
        }

        // Activité des 7 derniers jours (J-6 à J)
        const days: typeof walletData.last7Days = [];
        for (let i = 6; i >= 0; i--) {
          const dDate = new Date(now);
          dDate.setDate(now.getDate() - i);
          const y2 = dDate.getFullYear();
          const m2 = pad(dDate.getMonth() + 1);
          const d2 = pad(dDate.getDate());
          const fromDay = `${y2}-${m2}-${d2} 00:00:00`;
          const toDay = `${y2}-${m2}-${d2} 23:59:59`;

          const resDay = await apiFetch(
            `/driver/stats?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`,
            {
              headers: {
                Accept: 'application/json',
              },
            }
          );

          let earnings = 0;
          if (resDay?.ok) {
            const jsonDay = await resDay.json();
            if (typeof jsonDay.total_earnings === 'number') {
              earnings = jsonDay.total_earnings;
            }
          }

          const weekday = dDate.getDay(); // 0 = dim, 1 = lun, ...
          const labels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
          days.push({ day: labels[weekday], earnings });
        }

        if (!cancelled) {
          setLast7DaysDynamic(days);
        }

        // Transactions d'aujourd'hui
        const txRes = await apiFetch('/driver/wallet/transactions/today', {
          headers: {
            Accept: 'application/json',
          },
        });
        if (txRes?.ok && !cancelled) {
          const txJson = await txRes.json();
          const tx = Array.isArray(txJson.transactions) ? txJson.transactions : [];
          const mapped: typeof walletData.transactions = tx.map((t: any) => ({
            id: String(t.id ?? ''),
            type: (t.type === 'credit' ? 'bonus' : 'ride') as 'ride' | 'bonus' | 'withdrawal',
            description: t.label ?? 'Transaction',
            amount: typeof t.amount === 'number' ? t.amount : 0,
            time: t.time ?? '',
          }));
          setTodayTransactions(mapped);
        }
      } catch {
        if (!cancelled) {
          setError("Erreur réseau lors du chargement de votre portefeuille.");
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
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mon Portefeuille</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Carte du Solde Principal */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Solde disponible</Text>
          {loading ? (
            <Text style={styles.balanceAmount}>...</Text>
          ) : (
            <Text style={styles.balanceAmount}>
              {(balance ?? walletData.balance).toLocaleString('fr-FR')} {currency}
            </Text>
          )}
          <TouchableOpacity style={styles.withdrawButton} onPress={() => router.push('/wallet/withdraw' as Href)}>
            <Text style={styles.withdrawButtonText}>Retirer mes gains</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <Text style={{ fontFamily: Fonts.regular, fontSize: 13, color: 'red', marginBottom: 8 }}>
            {error}
          </Text>
        )}

        {/* Résumés Jour / Semaine */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Gains du jour</Text>
            <Text style={styles.summaryValue}>
              {(dailyEarnings ?? walletData.dailyEarnings).toLocaleString('fr-FR')} {currency}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Cette semaine</Text>
            <Text style={styles.summaryValue}>
              {(weeklyEarnings ?? walletData.weeklyEarnings).toLocaleString('fr-FR')} {currency}
            </Text>
          </View>
        </View>

        {/* Graphique des Gains (7 derniers jours depuis l'API, fallback mock) */}
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Activité des 7 derniers jours</Text>
          <View style={styles.chartContainer}>
            {maxEarningSource.map((item, index) => (
              <View key={index} style={styles.barWrapper}>
                <View style={[styles.bar, { height: `${(item.earnings / maxEarning) * 100}%` }]} />
                <Text style={styles.barLabel}>{item.day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Historique des Transactions du Jour */}
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>Transactions d'aujourd'hui</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>Tout voir</Text>
            </TouchableOpacity>
          </View>
          {(todayTransactions ?? walletData.transactions).length > 0 ? (
            (todayTransactions ?? walletData.transactions).map((item, index, arr) => {
              const { icon, color } = getTxStyle(item.type as any);
              return (
                <View key={item.id} style={[styles.txRow, index === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[styles.txIcon, { backgroundColor: color + '1A' }]}>
                    <MaterialCommunityIcons name={icon as any} size={24} color={color} />
                  </View>
                  <View style={styles.txDetails}>
                    <Text style={styles.txDescription}>{item.description}</Text>
                    <Text style={styles.txTime}>{item.time}</Text>
                  </View>
                  <Text style={styles.txAmount}>+{item.amount.toLocaleString('fr-FR')} FCFA</Text>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>Aucune transaction aujourd'hui.</Text>
          )}
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
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    color: Colors.black,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  balanceCard: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  balanceLabel: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  balanceAmount: {
    fontFamily: Fonts.bold,
    fontSize: 36,
    color: 'white',
    marginVertical: 8,
  },
  withdrawButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 12,
  },
  withdrawButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: 'white',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
  },
  summaryLabel: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: Colors.gray,
  },
  summaryValue: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.black,
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.black,
    marginBottom: 16,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  bar: {
    width: '50%',
    backgroundColor: Colors.primary + '30',
    borderRadius: 4,
  },
  barLabel: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.gray,
    marginTop: 8,
  },
  historyCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  seeAllText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.primary,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txDetails: {
    flex: 1,
  },
  txDescription: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.black,
  },
  txTime: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.gray,
    marginTop: 2,
  },
  txAmount: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.black,
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: Fonts.regular,
    color: Colors.gray,
    paddingVertical: 20,
  },
});
