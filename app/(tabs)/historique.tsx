import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useDriverStore } from '../providers/DriverProvider';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Fonts } from '../../font';
import { Colors, Shadows } from '../../theme';
import { fmtDayDateTime } from '../utils/dateFormat';

export default function DriverActivityTab() {
  const { history, loadHistoryFromBackend } = useDriverStore();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadHistoryFromBackend();
  }, [loadHistoryFromBackend]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadHistoryFromBackend(); } finally { setRefreshing(false); }
  };

  const renderItem = ({ item }: { item: any }) => {
    const rawDate = item.completedAt || item.createdAt;
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
                color={Colors.primary}
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
            <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
            <View style={styles.line} />
            <View style={[styles.dot, { backgroundColor: Colors.secondary }]} />
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <View style={styles.headerContainer}>
        <Text style={styles.title}>Historique des courses</Text>
        <Text style={styles.subtitle}>{history.length} course{history.length > 1 ? 's' : ''}</Text>
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="car-sport-outline" size={64} color="#475569" />
          <Text style={styles.emptyTitle}>Aucune course terminée</Text>
          <Text style={styles.emptySubtitle}>
            Vos courses apparaîtront ici une fois terminées.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : index.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} colors={[Colors.primary]} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: Colors.white,
    ...Shadows.sm,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.titilliumWebBold,
    color: Colors.black,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.titilliumWeb,
    color: Colors.gray,
    marginTop: 4,
  },

  listContent: {
    padding: 20,
    paddingBottom: 40,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    ...Shadows.sm,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceText: {
    fontSize: 14,
    fontFamily: Fonts.titilliumWebSemiBold,
    color: Colors.black,
  },
  dateText: {
    fontSize: 13,
    fontFamily: Fonts.titilliumWeb,
    color: Colors.gray,
    marginBottom: 16,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  successBadge: { backgroundColor: '#ECFDF5' },
  cancelledBadge: { backgroundColor: '#FEF2F2' },
  pendingBadge: { backgroundColor: '#FFFBEB' },

  statusBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.titilliumWebBold,
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
    fontSize: 14,
    fontFamily: Fonts.titilliumWeb,
    color: Colors.black,
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
    fontFamily: Fonts.titilliumWebBold,
    color: Colors.primary,
  },
  fareLabel: {
    fontSize: 10,
    fontFamily: Fonts.titilliumWeb,
    color: Colors.gray,
    marginTop: -2,
  },
  netEarningsText: {
    fontSize: 11,
    fontFamily: Fonts.titilliumWeb,
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
    fontFamily: Fonts.titilliumWebSemiBold,
    color: Colors.gray,
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: Fonts.titilliumWebBold,
    color: Colors.black,
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: Fonts.titilliumWeb,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  expandedDetails: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 4,
  },
  detailRow: {
    fontSize: 13,
    fontFamily: Fonts.titilliumWeb,
    color: Colors.black,
  },
  detailLabel: {
    fontFamily: Fonts.titilliumWebSemiBold,
    color: Colors.gray,
  },
});