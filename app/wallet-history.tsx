import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { getAuthToken } from './utils/authTokenStorage';
import { fmtTime } from './utils/dateFormat';

type TransactionType = 'ride' | 'topup' | 'delivery' | 'withdrawal' | 'bonus';
type Transaction = {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  date: string;
};
type HistoryMeta = { current_page: number; last_page: number };

const PER_PAGE = 30;
const FILTERS: { key: 'all' | TransactionType; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'ride', label: 'Courses' },
  { key: 'topup', label: 'Recharges' },
  { key: 'withdrawal', label: 'Retraits' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'delivery', label: 'Livraisons' },
];

const transactionStyle = (type: TransactionType) => {
  switch (type) {
    case 'topup': return { icon: 'arrow-down-bold-circle' as const, color: '#24914C' };
    case 'withdrawal': return { icon: 'bank-transfer-out' as const, color: '#E53935' };
    case 'bonus': return { icon: 'gift-outline' as const, color: '#B38F00' };
    case 'delivery': return { icon: 'package-variant-closed' as const, color: '#59625C' };
    default: return { icon: 'car-clock' as const, color: '#24914C' };
  }
};

const monthLabel = (date: Date) => date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

const groupByMonth = (transactions: Transaction[]) => {
  const groups = transactions.reduce((accumulator, transaction) => {
    const date = new Date(transaction.date);
    const month = Number.isNaN(date.getTime()) ? 'Sans date' : monthLabel(date);
    (accumulator[month] ??= []).push(transaction);
    return accumulator;
  }, {} as Record<string, Transaction[]>);

  return Object.entries(groups).map(([title, data]) => ({
    title: title.charAt(0).toUpperCase() + title.slice(1),
    data,
  }));
};

export default function DriverWalletHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<'all' | TransactionType>('all');
  const [sort, setSort] = useState<'recent' | 'amount'>('recent');
  const [sortVisible, setSortVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metaRef = useRef<HistoryMeta>({ current_page: 1, last_page: 1 });

  const mapRow = useCallback((row: Record<string, unknown>, index: number): Transaction => {
    const rawType = String(row.type ?? 'ride');
    const allowed: TransactionType[] = ['ride', 'topup', 'delivery', 'withdrawal', 'bonus'];
    const type = allowed.includes(rawType as TransactionType) ? rawType as TransactionType : 'ride';
    const rawDate = row.date ?? row.created_at;
    return {
      id: String(row.id ?? index),
      type,
      description: String(row.description ?? 'Transaction portefeuille'),
      amount: Number(row.amount ?? 0),
      date: typeof rawDate === 'string' ? rawDate : new Date().toISOString(),
    };
  }, []);

  const fetchPage = useCallback(async (page: number, append: boolean) => {
    if (!getApiBaseUrl() || !await getAuthToken()) {
      setError('Connexion requise pour charger votre historique.');
      if (!append) setTransactions([]);
      return;
    }

    const response = await apiFetch(`/driver/wallet/transactions/history?per_page=${PER_PAGE}&page=${page}`);
    if (!response?.ok) {
      setError(response ? `Erreur serveur (${response.status}).` : 'Impossible de contacter le serveur.');
      if (!append) setTransactions([]);
      return;
    }

    const json = await response.json().catch(() => null) as {
      data?: Record<string, unknown>[];
      meta?: HistoryMeta;
    } | null;
    if (!json || !Array.isArray(json.data)) {
      setError('Format de réponse inattendu.');
      return;
    }

    const mapped = json.data.map(mapRow);
    metaRef.current = json.meta ?? { current_page: page, last_page: page };
    setError(null);
    setTransactions((previous) => {
      if (!append) return mapped;
      const existing = new Set(previous.map((item) => item.id));
      return [...previous, ...mapped.filter((item) => !existing.has(item.id))];
    });
  }, [mapRow]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      await fetchPage(1, false);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { void loadInitial(); }, [loadInitial]);

  const loadMore = useCallback(async () => {
    const { current_page, last_page } = metaRef.current;
    if (loading || loadingMore || current_page >= last_page) return;
    setLoadingMore(true);
    try {
      await fetchPage(current_page + 1, true);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, loading, loadingMore]);

  const sections = useMemo(() => {
    const selected = filter === 'all' ? transactions : transactions.filter((item) => item.type === filter);
    const sorted = [...selected].sort((left, right) => {
      if (sort === 'amount') return Math.abs(right.amount) - Math.abs(left.amount);
      return new Date(right.date).getTime() - new Date(left.date).getTime();
    });
    return groupByMonth(sorted);
  }, [filter, sort, transactions]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#37BD6B', '#279C52']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 14 }]}
      >
        <Image source={require('../assets/images/logo_cabin.png')} style={styles.watermark} resizeMode="contain" />
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButton} onPress={() => setSortVisible(true)} hitSlop={10}>
          <MaterialCommunityIcons name="sort-variant" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Portefeuille</Text>
          <Text style={styles.headerTitle}>Historique</Text>
          <Text style={styles.headerSubtitle}>
            {transactions.length} mouvement{transactions.length > 1 ? 's' : ''} chargé{transactions.length > 1 ? 's' : ''}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {FILTERS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.chip, filter === item.key && styles.chipActive]}
              onPress={() => setFilter(item.key)}
            >
              <Text style={[styles.chipText, filter === item.key && styles.chipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading && transactions.length === 0 ? (
        <View style={styles.loader}><ActivityIndicator size="large" color="#2BA458" /></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.35}
          onEndReached={() => void loadMore()}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeaderWrap}><Text style={styles.sectionHeader}>{section.title}</Text></View>
          )}
          renderItem={({ item }) => {
            const visual = transactionStyle(item.type);
            const positive = item.amount > 0;
            const date = new Date(item.date);
            return (
              <View style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: `${visual.color}18` }]}>
                  <MaterialCommunityIcons name={visual.icon} size={22} color={visual.color} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.description}</Text>
                  <Text style={styles.rowTime}>{Number.isNaN(date.getTime()) ? '' : fmtTime(date)}</Text>
                </View>
                <Text style={[styles.rowAmount, { color: positive ? '#24914C' : '#E53935' }]}>
                  {positive ? '+' : ''}{item.amount.toLocaleString('fr-FR')} FCFA
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons name="file-document-outline" size={26} color="#24914C" />
              </View>
              <Text style={styles.emptyText}>{error ?? 'Aucune transaction.'}</Text>
              {error ? (
                <TouchableOpacity style={styles.retryButton} onPress={() => void loadInitial()}>
                  <Text style={styles.retryText}>Réessayer</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.listFooter} color="#2BA458" /> : null}
        />
      )}

      <Modal transparent animationType="slide" visible={sortVisible} onRequestClose={() => setSortVisible(false)}>
        <TouchableOpacity style={styles.overlay} onPress={() => setSortVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Trier par</Text>
          {([
            { key: 'recent' as const, label: 'Plus récent' },
            { key: 'amount' as const, label: 'Montant décroissant' },
          ]).map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.sortOption, sort === option.key && styles.sortOptionActive]}
              onPress={() => { setSort(option.key); setSortVisible(false); }}
            >
              <Text style={styles.sortText}>{option.label}</Text>
              {sort === option.key ? <Ionicons name="checkmark-circle" size={21} color="#2BA458" /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EFF3F0' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 188, paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
  },
  watermark: { position: 'absolute', right: -30, bottom: -62, width: 205, height: 205, opacity: 0.11, tintColor: '#FFFFFF' },
  headerButton: {
    zIndex: 2, width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerCopy: { position: 'absolute', left: 74, right: 74, bottom: 29, alignItems: 'center' },
  headerEyebrow: { fontFamily: Fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.68)' },
  headerTitle: { marginTop: 1, fontFamily: Fonts.bold, fontSize: 28, color: '#FFFFFF' },
  headerSubtitle: { marginTop: 2, fontFamily: Fonts.regular, fontSize: 11, color: 'rgba(255,255,255,0.72)' },
  filters: {
    zIndex: 3, width: '92%', maxWidth: 640, alignSelf: 'center', marginTop: -18, paddingVertical: 11,
    borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E9E4',
  },
  filterContent: { paddingHorizontal: 11, gap: 8 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F0F4F1' },
  chipActive: { backgroundColor: '#DFF2E5' },
  chipText: { fontFamily: Fonts.semiBold, fontSize: 13, color: '#6B776F' },
  chipTextActive: { color: '#208344' },
  listContent: { width: '92%', maxWidth: 640, alignSelf: 'center', paddingBottom: 38 },
  sectionHeaderWrap: { paddingTop: 20, paddingBottom: 8, backgroundColor: '#EFF3F0' },
  sectionHeader: { fontFamily: Fonts.bold, fontSize: 15, color: '#5E6B63' },
  row: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 8, padding: 13, borderRadius: 18,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E4EAE6',
  },
  rowIcon: { width: 42, height: 42, marginRight: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: Fonts.semiBold, fontSize: 14, color: '#1E2B23' },
  rowTime: { marginTop: 2, fontFamily: Fonts.regular, fontSize: 12, color: '#929B95' },
  rowAmount: { marginLeft: 8, fontFamily: Fonts.bold, fontSize: 13 },
  emptyState: { marginTop: 50, alignItems: 'center', paddingHorizontal: 24 },
  emptyIcon: {
    width: 52, height: 52, marginBottom: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E1F3E7',
  },
  emptyText: { fontFamily: Fonts.medium, fontSize: 15, color: '#7D8981', textAlign: 'center' },
  retryButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#2BA458' },
  retryText: { fontFamily: Fonts.bold, fontSize: 15, color: '#FFFFFF' },
  listFooter: { paddingVertical: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { padding: 20, paddingBottom: 40, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: '#FFFFFF' },
  grabber: { alignSelf: 'center', width: 42, height: 4, marginBottom: 14, borderRadius: 2, backgroundColor: '#D8DED9' },
  sheetTitle: { marginBottom: 16, fontFamily: Fonts.bold, fontSize: 20, textAlign: 'center', color: '#1E2B23' },
  sortOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
    padding: 15, borderRadius: 14, backgroundColor: '#F3F6F4',
  },
  sortOptionActive: { backgroundColor: '#E5F5EA' },
  sortText: { fontFamily: Fonts.semiBold, fontSize: 15, color: '#334139' },
});
