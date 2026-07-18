import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { DRIVER_BROADCAST_NOTIF_LAST_ACK_KEY } from './constants/driverBroadcastNotifications';
import { getAuthToken } from './utils/authTokenStorage';
import { fmtDateMedium, fmtTime } from './utils/dateFormat';

type DriverNotificationType = 'system' | 'promo' | 'alert' | 'ride';
type DriverNotification = {
  id: string;
  type: DriverNotificationType;
  title: string;
  message: string;
  createdAt: number;
  date: Date | null;
  sectionKey: string;
  timeLabel: string;
};

const notificationVisual = (type: DriverNotificationType) => {
  switch (type) {
    case 'promo':
      return { icon: 'gift-outline' as const, color: '#A87900', background: '#FFF1B5' };
    case 'alert':
      return { icon: 'alert-circle-outline' as const, color: Colors.error, background: '#FDE9E6' };
    case 'ride':
      return { icon: 'motorbike' as const, color: '#24914C', background: '#E5F6EB' };
    default:
      return { icon: 'information-outline' as const, color: '#5D625E', background: '#EEF0EE' };
  }
};

const groupNotificationsByDate = (notifications: DriverNotification[]) => {
  const groups = notifications.reduce((accumulator, notification) => {
    (accumulator[notification.sectionKey] ??= []).push(notification);
    return accumulator;
  }, {} as Record<string, DriverNotification[]>);

  return Object.entries(groups).map(([title, data]) => ({ title, data }));
};

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<DriverNotification | null>(null);

  const fetchNotifications = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const token = await getAuthToken();
      if (!token || !getApiBaseUrl()) {
        setNotifications([]);
        setError('Connexion requise pour charger vos notifications.');
        return;
      }

      const response = await apiFetch('/driver/notifications', {
        headers: { Accept: 'application/json' },
      });
      if (!response?.ok) {
        setNotifications([]);
        setError(response ? `Impossible de charger les notifications (${response.status}).` : 'Serveur indisponible.');
        return;
      }

      const data = await response.json().catch(() => []);
      const seen = new Set<string>();
      const mapped: DriverNotification[] = (Array.isArray(data) ? data : [])
        .filter((item: { id?: unknown }) => {
          const id = String(item?.id ?? '');
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((item: any) => {
          const parsedDate = item.created_at ? new Date(item.created_at) : null;
          const date = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
          const allowedTypes: DriverNotificationType[] = ['system', 'promo', 'alert', 'ride'];
          const type = allowedTypes.includes(item.type) ? item.type as DriverNotificationType : 'system';
          return {
            id: String(item.id),
            type,
            title: String(item.title ?? 'Information'),
            message: String(item.message ?? ''),
            createdAt: date?.getTime() ?? 0,
            date,
            sectionKey: date ? fmtDateMedium(date) : 'Sans date',
            timeLabel: date ? fmtTime(date) : '',
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      setNotifications(mapped);
      await AsyncStorage.setItem(DRIVER_BROADCAST_NOTIF_LAST_ACK_KEY, new Date().toISOString());
    } catch (fetchError) {
      console.error('Error fetching notifications:', fetchError);
      setNotifications([]);
      setError('Erreur réseau. Vérifiez votre connexion et réessayez.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const groupedNotifications = useMemo(
    () => groupNotificationsByDate(notifications),
    [notifications],
  );

  const renderNotification = ({ item }: { item: DriverNotification }) => {
    const visual = notificationVisual(item.type);
    return (
      <TouchableOpacity
        style={styles.notificationCard}
        onPress={() => setSelectedNotification(item)}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir ${item.title}`}
      >
        <View style={[styles.iconContainer, { backgroundColor: visual.background }]}>
          <MaterialCommunityIcons name={visual.icon} size={24} color={visual.color} />
        </View>
        <View style={styles.textContainer}>
          <View style={styles.itemHeading}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.itemTime}>{item.timeLabel}</Text>
          </View>
          <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#A6A195" style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={[Colors.primary, '#FFC928', Colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <Image
          source={require('../assets/images/logo_cabin.png')}
          style={styles.watermark}
          resizeMode="contain"
        />
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerButton}
            hitSlop={10}
            accessibilityLabel="Retour"
          >
            <Ionicons name="arrow-back" size={22} color={Colors.dark} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => void fetchNotifications(true)}
            activeOpacity={0.8}
            disabled={refreshing}
            accessibilityLabel="Actualiser les notifications"
          >
            {refreshing
              ? <ActivityIndicator size="small" color={Colors.dark} />
              : <Ionicons name="refresh" size={21} color={Colors.dark} />}
          </TouchableOpacity>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Informations chauffeur</Text>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>
            {notifications.length > 0
              ? `${notifications.length} message${notifications.length > 1 ? 's' : ''}`
              : 'Aucun nouveau message'}
          </Text>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryDark} />
          <Text style={styles.loadingText}>Chargement des notifications...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, styles.errorIcon]}>
            <Ionicons name="cloud-offline-outline" size={34} color={Colors.error} />
          </View>
          <Text style={styles.emptyTitle}>Chargement impossible</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void fetchNotifications()}>
            <Ionicons name="refresh" size={18} color={Colors.dark} />
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-off-outline" size={34} color="#9A7810" />
          </View>
          <Text style={styles.emptyTitle}>Aucune notification</Text>
          <Text style={styles.emptySubtitle}>
            Les annonces, alertes et informations liées à votre activité apparaîtront ici.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={groupedNotifications}
          keyExtractor={item => item.id}
          renderItem={renderNotification}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 28 }]}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void fetchNotifications(true)}
              colors={[Colors.primaryDark]}
              tintColor={Colors.primaryDark}
            />
          )}
        />
      )}

      <Modal
        visible={!!selectedNotification}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedNotification(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setSelectedNotification(null)}
            accessibilityLabel="Fermer le détail"
          />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalBellIcon}>
                <Ionicons name="notifications" size={22} color={Colors.dark} />
              </View>
              <Text style={styles.modalTitle}>Détail du message</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedNotification(null)}>
                <Ionicons name="close" size={22} color={Colors.dark} />
              </TouchableOpacity>
            </View>
            {selectedNotification && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.detailTitle}>{selectedNotification.title}</Text>
                <Text style={styles.detailDate}>
                  {selectedNotification.date
                    ? `Reçu le ${fmtDateMedium(selectedNotification.date)} à ${fmtTime(selectedNotification.date)}`
                    : 'Date indisponible'}
                </Text>
                <View style={styles.divider} />
                <Text style={styles.detailMessage}>{selectedNotification.message}</Text>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedNotification(null)}>
              <Text style={styles.closeButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F3E9',
  },
  header: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 205,
    paddingHorizontal: 20,
    paddingBottom: 27,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  watermark: {
    position: 'absolute',
    width: 220,
    height: 220,
    right: -38,
    bottom: -68,
    opacity: 0.08,
    tintColor: Colors.dark,
    transform: [{ rotate: '-8deg' }],
  },
  headerTopRow: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  headerCopy: {
    marginTop: 22,
  },
  headerEyebrow: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: 'rgba(26,26,26,0.62)',
  },
  headerTitle: {
    marginTop: 1,
    fontFamily: Fonts.bold,
    fontSize: 30,
    lineHeight: 35,
    color: Colors.dark,
  },
  headerSubtitle: {
    marginTop: 4,
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: 'rgba(26,26,26,0.68)',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  loadingText: {
    marginTop: 12,
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: '#7B7464',
  },
  listContent: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 9,
  },
  sectionHeader: {
    marginTop: 17,
    marginBottom: 8,
    marginLeft: 4,
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: '#6D685E',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 88,
    marginBottom: 10,
    padding: 14,
    borderRadius: 19,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#EAE5D8',
    shadowColor: '#493B13',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  itemHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.dark,
  },
  itemTime: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: '#969084',
  },
  itemMessage: {
    marginTop: 3,
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: '#716D64',
  },
  chevron: {
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 38,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    backgroundColor: '#FFF0AF',
  },
  errorIcon: {
    backgroundColor: '#FCE9E6',
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    color: Colors.dark,
    textAlign: 'center',
  },
  emptySubtitle: {
    maxWidth: 340,
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: '#7B766D',
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  retryButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.dark,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(18,18,18,0.48)',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalContent: {
    maxHeight: '78%',
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: Colors.white,
  },
  modalHandle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    marginBottom: 15,
    borderRadius: 3,
    backgroundColor: '#D8D4C9',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalBellIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0AF',
  },
  modalTitle: {
    flex: 1,
    marginLeft: 11,
    fontFamily: Fonts.bold,
    fontSize: 19,
    color: Colors.dark,
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F0EA',
  },
  modalBody: {
    marginBottom: 18,
  },
  detailTitle: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: Colors.dark,
  },
  detailDate: {
    marginTop: 6,
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: '#918B80',
  },
  divider: {
    height: 1,
    marginVertical: 17,
    backgroundColor: '#ECE8DE',
  },
  detailMessage: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: '#59564F',
  },
  closeButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 15,
    backgroundColor: Colors.primary,
  },
  closeButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.dark,
  },
});
