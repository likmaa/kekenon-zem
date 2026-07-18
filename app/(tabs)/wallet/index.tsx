// screens/driver/WalletScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../../theme';
import { Fonts } from '../../../font';
import { apiFetch, getApiBaseUrl } from '../../utils/apiClient';
import { getAuthToken } from '../../utils/authTokenStorage';

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
      return { icon: 'car-clock', color: '#2BA458' };
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
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [bonusBalance, setBonusBalance] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('FCFA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyEarnings, setDailyEarnings] = useState<number | null>(null);
  const [weeklyEarnings, setWeeklyEarnings] = useState<number | null>(null);
  const [last7DaysDynamic, setLast7DaysDynamic] = useState<typeof walletData.last7Days | null>(null);
  const [todayTransactions, setTodayTransactions] = useState<typeof walletData.transactions | null>(null);

  const maxEarningSource = last7DaysDynamic ?? walletData.last7Days;
  const maxEarning = Math.max(...maxEarningSource.map(d => d.earnings), 1); // Évite la division par zéro

  // useFocusEffect (et non useEffect []) : l'onglet reste monté, il faut
  // rafraîchir solde/bonus/transactions à chaque retour sur l'écran.
  useFocusEffect(useCallback(() => {
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
          setBonusBalance(typeof json.bonus_balance === 'number' ? json.bonus_balance : 0);
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
            type: (
              t.type === 'withdrawal' || t.type === 'debit'
                ? 'withdrawal'
                : t.type === 'credit' || t.type === 'bonus'
                  ? 'bonus'
                  : 'ride'
            ) as 'ride' | 'bonus' | 'withdrawal',
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
  }, []));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#37BD6B" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#37BD6B', '#279C52']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.walletHero}
        >
          <Image
            source={require('../../../assets/images/logo_cabin.png')}
            style={styles.watermark}
            resizeMode="contain"
          />

          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroEyebrow}>Mes finances</Text>
              <Text style={styles.heroTitle}>Portefeuille</Text>
            </View>
            <View style={styles.heroIcon}>
              <Ionicons name="wallet-outline" size={23} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.balanceLabelRow}>
            <Text style={styles.balanceLabel}>Solde disponible</Text>
            <TouchableOpacity
              style={styles.visibilityButton}
              onPress={() => setBalanceHidden((hidden) => !hidden)}
              hitSlop={10}
              accessibilityLabel={balanceHidden ? 'Afficher le solde' : 'Masquer le solde'}
            >
              <Ionicons
                name={balanceHidden ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color="rgba(255,255,255,0.9)"
              />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.balanceLoading}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
          ) : (
            <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit>
              {balanceHidden
                ? '••••••'
                : `${(balance ?? walletData.balance).toLocaleString('fr-FR')} ${currency}`}
            </Text>
          )}

          <View style={styles.heroFooter}>
            <View style={styles.bonusRow}>
              <View style={styles.bonusIcon}>
                <Ionicons name="gift-outline" size={15} color="#1A1A1A" />
              </View>
              <View>
                <Text style={styles.bonusLabel}>Bonus</Text>
                <Text style={styles.bonusRowText}>
                  {bonusBalance.toLocaleString('fr-FR')} {currency}
                </Text>
              </View>
            </View>

            <View style={styles.walletActions}>
              <TouchableOpacity
                style={styles.rechargeButton}
                onPress={() => router.push('/wallet-topup')}
                activeOpacity={0.86}
              >
                <Ionicons name="add" size={20} color="#185F35" />
                <Text style={styles.rechargeButtonText}>Recharger</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.withdrawIconButton}
                onPress={() => router.push('/wallet/withdraw' as Href)}
                activeOpacity={0.86}
                accessibilityLabel="Retirer mes gains"
              >
                <MaterialCommunityIcons name="bank-transfer-out" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.bodyContent}>
          {error ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={20} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <View style={styles.summaryIcon}>
                <Ionicons name="today-outline" size={19} color="#24914C" />
              </View>
              <Text style={styles.summaryLabel}>Aujourd'hui</Text>
              <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
                {(dailyEarnings ?? walletData.dailyEarnings).toLocaleString('fr-FR')} {currency}
              </Text>
              <Text style={styles.summaryCaption}>Gains du jour</Text>
            </View>

            <View style={styles.summaryBox}>
              <View style={styles.summaryIcon}>
                <Ionicons name="calendar-outline" size={19} color="#24914C" />
              </View>
              <Text style={styles.summaryLabel}>Cette semaine</Text>
              <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
                {(weeklyEarnings ?? walletData.weeklyEarnings).toLocaleString('fr-FR')} {currency}
              </Text>
              <Text style={styles.summaryCaption}>Du lundi à aujourd'hui</Text>
            </View>
          </View>

          <View style={styles.chartCard}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Activité récente</Text>
                <Text style={styles.sectionSubtitle}>Gains des 7 derniers jours</Text>
              </View>
              <View style={styles.trendBadge}>
                <MaterialCommunityIcons name="chart-bar" size={17} color="#24914C" />
              </View>
            </View>

            <View style={styles.chartContainer}>
              {maxEarningSource.map((item, index) => {
                const barHeight = Math.max(6, (item.earnings / maxEarning) * 88);
                const isLatest = index === maxEarningSource.length - 1;

                return (
                  <View key={`${item.day}-${index}`} style={styles.barWrapper}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          { height: barHeight },
                          isLatest && styles.latestBar,
                        ]}
                      />
                    </View>
                    <Text style={[styles.barLabel, isLatest && styles.latestBarLabel]}>{item.day}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.sectionTitle}>Transactions</Text>
                <Text style={styles.sectionSubtitle}>Mouvements d'aujourd'hui</Text>
              </View>
              <TouchableOpacity
                style={styles.historyLink}
                onPress={() => router.push('/wallet-history')}
                activeOpacity={0.8}
              >
                <Text style={styles.transactionCountText}>
                  {(todayTransactions ?? walletData.transactions).length}
                </Text>
                <Text style={styles.historyLinkText}>Tout voir</Text>
                <Ionicons name="chevron-forward" size={14} color="#24914C" />
              </TouchableOpacity>
            </View>

            <View style={styles.historyCard}>
              {(todayTransactions ?? walletData.transactions).length > 0 ? (
                (todayTransactions ?? walletData.transactions).map((item, index, arr) => {
                  const { icon, color } = getTxStyle(item.type);
                  const isWithdrawal = item.type === 'withdrawal';

                  return (
                    <View
                      key={item.id}
                      style={[styles.txRow, index === arr.length - 1 && styles.lastTxRow]}
                    >
                      <View style={[styles.txIcon, { backgroundColor: `${color}18` }]}>
                        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
                      </View>
                      <View style={styles.txDetails}>
                        <Text style={styles.txDescription}>{item.description}</Text>
                        <Text style={styles.txTime}>{item.time || "Aujourd'hui"}</Text>
                      </View>
                      <Text style={[styles.txAmount, isWithdrawal && styles.withdrawalAmount]}>
                        {isWithdrawal ? '−' : '+'}{Math.abs(item.amount).toLocaleString('fr-FR')} {currency}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <MaterialCommunityIcons name="file-document-outline" size={25} color="#24914C" />
                  </View>
                  <Text style={styles.emptyTitle}>Aucun mouvement</Text>
                  <Text style={styles.emptyText}>Vos transactions du jour apparaîtront ici.</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#37BD6B',
  },
  scrollView: {
    backgroundColor: '#EFF3F0',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  walletHero: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    padding: 22,
    paddingTop: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#176832',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  watermark: {
    position: 'absolute',
    right: -28,
    bottom: -48,
    width: 210,
    height: 210,
    opacity: 0.12,
    tintColor: '#FFFFFF',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  heroEyebrow: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
  },
  heroTitle: {
    marginTop: 1,
    fontFamily: Fonts.bold,
    fontSize: 27,
    color: '#FFFFFF',
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
  },
  visibilityButton: {
    marginLeft: 8,
    padding: 2,
  },
  balanceAmount: {
    maxWidth: '100%',
    marginTop: 3,
    fontFamily: Fonts.bold,
    fontSize: 39,
    lineHeight: 47,
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  balanceLoading: {
    height: 50,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  bonusRow: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  bonusIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDD835',
  },
  bonusLabel: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.68)',
  },
  bonusRowText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  walletActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginLeft: 10,
  },
  rechargeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  rechargeButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: '#185F35',
  },
  withdrawIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  bodyContent: {
    width: '92%',
    maxWidth: 640,
    alignSelf: 'center',
    marginTop: 18,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#FFF1F0',
    borderWidth: 1,
    borderColor: '#FFD5D1',
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 17,
    color: '#9D2D26',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryBox: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6ECE7',
  },
  summaryIcon: {
    width: 36,
    height: 36,
    marginBottom: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF7EE',
  },
  summaryLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: '#738078',
  },
  summaryValue: {
    marginTop: 3,
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 25,
    color: '#17251D',
  },
  summaryCaption: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 10,
    color: '#9AA39D',
  },
  chartCard: {
    marginBottom: 20,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6ECE7',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: '#17251D',
  },
  sectionSubtitle: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: '#89938C',
  },
  trendBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF7EE',
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 122,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    height: 94,
    justifyContent: 'flex-end',
  },
  bar: {
    width: 16,
    borderRadius: 8,
    backgroundColor: '#CDE9D5',
  },
  latestBar: {
    backgroundColor: '#2BA458',
  },
  barLabel: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: '#8B958E',
  },
  latestBarLabel: {
    fontFamily: Fonts.bold,
    color: '#24914C',
  },
  historySection: {
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 10,
    justifyContent: 'center',
    backgroundColor: '#DFF2E5',
  },
  transactionCountText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: '#24914C',
  },
  historyLinkText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: '#24914C',
  },
  historyCard: {
    overflow: 'hidden',
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6ECE7',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0EE',
  },
  lastTxRow: {
    borderBottomWidth: 0,
  },
  txIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txDetails: {
    flex: 1,
  },
  txDescription: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: '#1E2B23',
  },
  txTime: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: '#929B95',
  },
  txAmount: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: '#24914C',
  },
  withdrawalAmount: {
    color: Colors.error,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    marginBottom: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF7EE',
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: '#26362C',
  },
  emptyText: {
    marginTop: 3,
    textAlign: 'center',
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: '#8C968F',
  },
});
