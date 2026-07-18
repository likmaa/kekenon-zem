import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  View,
  Text,
  FlatList,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDriverStore } from '../providers/DriverProvider';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Fonts } from '../../font';
import { Colors } from '../../theme';
import { fmtDayDateTime } from '../utils/dateFormat';

export default function DriverActivityTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { history, loadHistoryFromBackend } = useDriverStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled' | 'delivery'>('all');

  useEffect(() => {
    void (async () => {
      try { await loadHistoryFromBackend(); } finally { setLoading(false); }
    })();
  }, [loadHistoryFromBackend]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadHistoryFromBackend(); } finally { setRefreshing(false); }
  };

  const filteredHistory = useMemo(() => history.filter((item: any) => {
    if (filter === 'all') return true;
    if (filter === 'delivery') return item.service_type === 'livraison';
    if (filter === 'completed') return item.status === 'completed' || item.status === 'payé';
    return item.status === 'cancelled' || item.status === 'annulée';
  }), [filter, history]);

  const renderItem = ({ item }: { item: any }) => {
    const rawDate = item.completedAt || item.cancelledAt || item.createdAt;
    const d = rawDate ? new Date(rawDate) : null;
    const date = d && !Number.isNaN(d.getTime()) ? fmtDayDateTime(d) : '—';
    const itemId = item.id ? String(item.id) : '';

    const isSuccess = item.status === 'completed' || item.status === 'payé';
    const isCancelled = item.status === 'cancelled' || item.status === 'annulée';
    const isLivraison = item.service_type === 'livraison';

    const isExpanded = expandedId === itemId;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setExpandedId(isExpanded ? null : itemId)}
      >
        {/* En-tête avec service et statut */}
        <View style={styles.cardHeader}>
          <View style={styles.serviceBox}>
            <View style={styles.serviceIconCircle}>
              <MaterialCommunityIcons
                name={isLivraison ? "package-variant" : "car"}
                size={18}
                color={isLivraison ? '#B38F00' : '#24914C'}
              />
            </View>
            <Text style={styles.serviceText}>
              {isLivraison ? 'Livraison' : 'Course'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[
              styles.statusBadge,
              isSuccess ? styles.successBadge : (isCancelled ? styles.cancelledBadge : styles.pendingBadge)
            ]}>
              <Text style={[
                styles.statusBadgeText,
                isSuccess ? styles.successText : (isCancelled ? styles.cancelledText : styles.pendingText)
              ]}>
                {isSuccess ? 'Terminée' : isCancelled ? 'Annulée' : 'Expirée'}
              </Text>
            </View>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.gray}
            />
          </View>
        </View>

        <Text style={styles.dateText}>{date}</Text>

        {/* Trajet visualisé */}
        <View style={styles.routeContainer}>
          <View style={styles.dotLine}>
            <View style={[styles.dot, { backgroundColor: '#2BA458' }]} />
            <View style={styles.line} />
            <View style={[styles.dot, { backgroundColor: '#E53935' }]} />
          </View>
          <View style={styles.addressList}>
            <Text style={styles.addressText} numberOfLines={isExpanded ? undefined : 1}>{item.pickup}</Text>
            <Text style={styles.addressText} numberOfLines={isExpanded ? undefined : 1}>{item.dropoff}</Text>
          </View>
        </View>

        {/* Détails étendus */}
        {isExpanded && (
          <View style={styles.expandedDetails}>
            {item.id ? (
              <Text style={styles.detailRow}><Text style={styles.detailLabel}>ID course : </Text>#{item.id}</Text>
            ) : null}
            {item.distanceKm ? (
              <Text style={styles.detailRow}><Text style={styles.detailLabel}>Distance : </Text>{Number(item.distanceKm).toFixed(1)} km</Text>
            ) : null}
            {item.durationMin ? (
              <Text style={styles.detailRow}><Text style={styles.detailLabel}>Durée : </Text>{item.durationMin} min</Text>
            ) : null}
            {item.passengerName ? (
              <Text style={styles.detailRow}><Text style={styles.detailLabel}>Passager : </Text>{item.passengerName}</Text>
            ) : null}
            {item.notes ? (
              <Text style={styles.detailRow}><Text style={styles.detailLabel}>Notes : </Text>{item.notes}</Text>
            ) : null}
          </View>
        )}

        {/* Pied de carte */}
        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.fareAmount}>
              {(Number(item.fare) || 0).toLocaleString('fr-FR')} F
            </Text>
            <Text style={styles.fareLabel}>Montant total</Text>
          </View>

          <View style={styles.cardFooterRight}>
            <View style={styles.paymentBadge}>
              <Ionicons
                name={item.paymentMethod === 'cash' ? 'cash' : 'card'}
                size={14}
                color={Colors.gray}
              />
              <Text style={styles.paymentLabel}>
                {item.paymentMethod === 'cash' ? 'Espèces' : 'M-Money'}
              </Text>
            </View>
            {item.driverEarnings ? (
              <Text style={styles.netEarningsText}>Gain net: {(Number(item.driverEarnings) || 0).toLocaleString('fr-FR')} F</Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#37BD6B', '#279C52']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerContainer, { paddingTop: insets.top + 14 }]}
      >
        <Image source={require('../../assets/images/logo_cabin.png')} style={styles.watermark} resizeMode="contain" />
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Vos prestations</Text>
          <Text style={styles.title}>Activité</Text>
          <Text style={styles.subtitle}>{history.length} course{history.length > 1 ? 's' : ''}</Text>
        </View>
      </LinearGradient>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {([
            { key: 'all' as const, label: 'Toutes' },
            { key: 'completed' as const, label: 'Terminées' },
            { key: 'cancelled' as const, label: 'Annulées' },
            { key: 'delivery' as const, label: 'Livraisons' },
          ]).map((item) => (
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

      {loading ? (
        <View style={styles.loader}><ActivityIndicator size="large" color="#2BA458" /></View>
      ) : filteredHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><Ionicons name="car-sport-outline" size={28} color="#24914C" /></View>
          <Text style={styles.emptyTitle}>Aucune activité</Text>
          <Text style={styles.emptySubtitle}>
            Les courses correspondant à ce filtre apparaîtront ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredHistory}
          keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : index.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} colors={['#2BA458']} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF3F0',
  },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerContainer: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 190,
    paddingHorizontal: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  watermark: {
    position: 'absolute',
    right: -30,
    bottom: -62,
    width: 205,
    height: 205,
    opacity: 0.11,
    tintColor: '#FFFFFF',
  },
  backButton: {
    zIndex: 2,
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerCopy: {
    position: 'absolute',
    left: 74,
    right: 74,
    bottom: 29,
    alignItems: 'center',
  },
  headerEyebrow: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.68)',
  },
  title: {
    marginTop: 1,
    fontSize: 29,
    fontFamily: Fonts.bold,
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
  },
  filterContainer: {
    zIndex: 3,
    width: '92%',
    maxWidth: 640,
    alignSelf: 'center',
    marginTop: -18,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E9E4',
  },
  filterContent: { paddingHorizontal: 11, gap: 8 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F0F4F1' },
  chipActive: { backgroundColor: '#DFF2E5' },
  chipText: { fontFamily: Fonts.semiBold, fontSize: 13, color: '#6B776F' },
  chipTextActive: { color: '#208344' },

  listContent: {
    paddingTop: 18,
    paddingBottom: 110,
    maxWidth: 640,
    width: '92%',
    alignSelf: 'center',
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E3E9E5',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serviceIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EAF7EE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: '#1E2B23',
  },
  dateText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.gray,
    marginBottom: 14,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  successBadge: { backgroundColor: '#E5F5EA' },
  cancelledBadge: { backgroundColor: '#FEF2F2' },
  pendingBadge: { backgroundColor: '#FFFBEB' },

  statusBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
  },
  successText: { color: '#059669' },
  cancelledText: { color: '#EF4444' },
  pendingText: { color: '#D97706' },

  routeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dotLine: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  line: {
    width: 1.5,
    height: 20,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  addressList: {
    flex: 1,
    justifyContent: 'space-between',
  },
  addressText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: '#465249',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  cardFooterRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  fareAmount: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: '#24914C',
  },
  fareLabel: {
    fontSize: 10,
    fontFamily: Fonts.regular,
    color: Colors.gray,
    marginTop: -2,
  },
  netEarningsText: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: Colors.success,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  paymentLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.gray,
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E1F3E7',
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: '#26342B',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  expandedDetails: {
    backgroundColor: '#F0F5F1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  detailRow: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.black,
  },
  detailLabel: {
    fontFamily: Fonts.semiBold,
    color: Colors.gray,
  },
});
