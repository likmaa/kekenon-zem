import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Platform, Linking, Alert, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors, Gradients, Shadows } from '../../theme';
import { Fonts } from '../../font';
import { useDriverStore, RideTakenError } from '../providers/DriverProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { getImageUrl, withImageVersion } from '../utils/images';
import { apiFetch, getApiBaseUrl } from '../utils/apiClient';
import { DRIVER_BROADCAST_NOTIF_LAST_ACK_KEY } from '../constants/driverBroadcastNotifications';

/** Fenêtre visuelle d’acceptation par offre (alignée sur l’ancien décompte ~5 min côté client). */
const OFFER_VISUAL_TTL_MS = 5 * 60 * 1000;

const debugLocationLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log('[DriverDashboard][Location]', ...args);
  }
};

// Nouveaux composants
import DriverBalanceCard from '../components/DriverBalanceCard';
import HelmetOnlineToggle from '../components/HelmetOnlineToggle';
import SubscriptionModal from '../components/SubscriptionModal';
import { MonthlyEarningsModal } from '../components/MonthlyEarningsModal';
import { DriverOffersBottomSheet } from '../components/DriverOffersBottomSheet';
import { BackgroundLocationBanner } from '../components/BackgroundLocationBanner';
import { getAuthToken, removeAuthToken } from '../utils/authTokenStorage';

// Constantes de spacing
const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

export default function DriverDashboardScreen() {
  const router = useRouter();
  const isDashboardFocused = useIsFocused();
  const { currentRide, availableOffers, lastLat, lastLng, history, online, setOnline, syncCurrentRide, acceptRequest, declineRequest, loadHistoryFromBackend, driverProfile, refreshProfile } = useDriverStore();
  const [driverName, setDriverName] = useState<string>('Chauffeur');
  const [driverPhoto, setDriverPhoto] = useState<string | null>(null);
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);
  const [showMonthlyEarningsModal, setShowMonthlyEarningsModal] = useState(false);
  const [subscriptionDismissed, setSubscriptionDismissed] = useState(false);
  const insets = useSafeAreaInsets();


  const [apiStats, setApiStats] = useState<{
    todayRides: number;
    todayEarnings: number;
    todayFare: number;
    monthRides: number;
    monthEarnings: number;
    monthFare: number;
  }>({
    todayRides: 0,
    todayEarnings: 0,
    todayFare: 0,
    monthRides: 0,
    monthEarnings: 0,
    monthFare: 0
  });
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletBonus, setWalletBonus] = useState<number>(0);
  const [hasUnreadBroadcastNotifications, setHasUnreadBroadcastNotifications] = useState(false);
  const [isDashboardRefreshing, setIsDashboardRefreshing] = useState(false);
  const [initialDashboardLoadDone, setInitialDashboardLoadDone] = useState(false);
  const [dashboardSummaryError, setDashboardSummaryError] = useState<string | null>(null);
  const offerFirstSeenMsRef = useRef<Record<string, number>>({});
  const [offerTimerTick, setOfferTimerTick] = useState(0);
  const [offersSheetOpen, setOffersSheetOpen] = useState(false);
  const prevOffersCountRef = useRef(0);
  const offerRingtoneRef = useRef<Audio.Sound | null>(null);

  const stopOfferRingtone = useCallback(async () => {
    try {
      await offerRingtoneRef.current?.stopAsync();
      await offerRingtoneRef.current?.unloadAsync();
    } catch {
      /* ignore */
    }
    offerRingtoneRef.current = null;
  }, []);

  /** Sonnerie dès qu’il y a des offres sur l’accueil (même sheet fermé), arrêtée sur autre onglet ou écran détail. */
  useEffect(() => {
    const shouldPlay =
      isDashboardFocused &&
      online &&
      !currentRide &&
      availableOffers.length > 0;

    if (!shouldPlay) {
      void stopOfferRingtone();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        if (cancelled || offerRingtoneRef.current) return;
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/ride.wav'),
          { isLooping: true, volume: 1.0 }
        );
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        offerRingtoneRef.current = sound;
        await sound.playAsync();
      } catch (e) {
        if (__DEV__) console.warn('[DriverDashboard] Sonnerie offres:', e);
      }
    })();

    return () => {
      cancelled = true;
      void stopOfferRingtone();
    };
  }, [
    isDashboardFocused,
    online,
    currentRide,
    availableOffers.length,
    stopOfferRingtone,
  ]);

  const loadDashboardData = useCallback(async () => {
    const hasApi = !!getApiBaseUrl();
    const token = await getAuthToken();
    const expectApi = hasApi && !!token;

    let profileFailed = false;
    let statsFailed = false;
    let walletFailed = false;

    const fetchDriverInfo = async () => {
      try {
        const userStr = await AsyncStorage.getItem('authUser');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user.name) {
            setDriverName(user.name);
          } else if (user.phone) {
            setDriverName(user.phone);
          }
        }

        if (hasApi && token) {
          const profileRes = await apiFetch('/driver/profile', {
            headers: { Accept: 'application/json' },
          });
          if (profileRes?.ok) {
            const profileData = await profileRes.json();
            const user = profileData.user ?? {};
            const profile = profileData.profile ?? null;
            const photo = profile?.photo || user.photo || null;
            if (photo) {
              const photoSeed = profile?.updated_at ?? user?.updated_at ?? profile?.id ?? user?.id ?? Date.now();
              setDriverPhoto(withImageVersion(getImageUrl(photo), photoSeed));
            }
            if (user.name) setDriverName(user.name);
          } else {
            profileFailed = true;
          }
        }
      } catch (error) {
        if (expectApi) profileFailed = true;
        if (__DEV__) console.error('Erreur récupération profil:', error);
      }
    };

    const fetchStatsFromAPI = async () => {
      try {
        if (!hasApi || !token) return;

        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        const monthEnd = todayStr;

        const todayRes = await apiFetch(
          `/driver/stats?from=${encodeURIComponent(todayStr)}&to=${encodeURIComponent(todayStr)}`,
          { headers: { Accept: 'application/json' } }
        );
        const monthRes = await apiFetch(
          `/driver/stats?from=${encodeURIComponent(monthStart)}&to=${encodeURIComponent(monthEnd)}`,
          { headers: { Accept: 'application/json' } }
        );

        let todayData = { total_rides: 0, total_earnings: 0, total_fare: 0 };
        let monthData = { total_rides: 0, total_earnings: 0, total_fare: 0 };

        if (todayRes?.ok) {
          todayData = await todayRes.json();
        } else {
          statsFailed = true;
        }
        if (monthRes?.ok) {
          monthData = await monthRes.json();
        } else {
          statsFailed = true;
        }

        setApiStats({
          todayRides: todayData.total_rides || 0,
          todayEarnings: todayData.total_earnings || 0,
          todayFare: todayData.total_fare || 0,
          monthRides: monthData.total_rides || 0,
          monthEarnings: monthData.total_earnings || 0,
          monthFare: monthData.total_fare || 0,
        });
      } catch (error) {
        statsFailed = true;
        if (__DEV__) console.error('Erreur récupération stats API:', error);
      }
    };

    const fetchWalletBalance = async () => {
      try {
        if (!hasApi || !token) return;

        const res = await apiFetch('/driver/wallet', {
          headers: { Accept: 'application/json' },
        });

        if (res?.ok) {
          const data = await res.json();
          setWalletBalance(Number(data.balance) || 0);
          setWalletBonus(Number(data.bonus_balance) || 0);
        } else {
          walletFailed = true;
        }
      } catch (error) {
        walletFailed = true;
        if (__DEV__) console.error('Erreur récupération wallet:', error);
      }
    };

    const fetchBroadcastNotificationBadge = async () => {
      try {
        if (!hasApi || !token) {
          setHasUnreadBroadcastNotifications(false);
          return;
        }

        const res = await apiFetch('/driver/notifications', {
          headers: { Accept: 'application/json' },
        });

        if (!res?.ok) {
          setHasUnreadBroadcastNotifications(false);
          return;
        }

        const list = await res.json().catch(() => null);
        if (!Array.isArray(list) || list.length === 0) {
          setHasUnreadBroadcastNotifications(false);
          return;
        }

        let lastAck = await AsyncStorage.getItem(DRIVER_BROADCAST_NOTIF_LAST_ACK_KEY);
        if (!lastAck) {
          const newestMs = list.reduce((acc: number, n: { created_at?: string }) => {
            const t = n.created_at ? new Date(n.created_at).getTime() : 0;
            return Number.isFinite(t) && t > acc ? t : acc;
          }, 0);
          if (newestMs > 0) {
            await AsyncStorage.setItem(DRIVER_BROADCAST_NOTIF_LAST_ACK_KEY, new Date(newestMs).toISOString());
          }
          setHasUnreadBroadcastNotifications(false);
          return;
        }

        const ackMs = new Date(lastAck).getTime();
        const hasUnread = list.some((n: { created_at?: string }) => {
          const t = n.created_at ? new Date(n.created_at).getTime() : 0;
          return Number.isFinite(t) && t > ackMs;
        });
        setHasUnreadBroadcastNotifications(hasUnread);
      } catch {
        setHasUnreadBroadcastNotifications(false);
      }
    };

    await Promise.all([
      fetchDriverInfo(),
      fetchStatsFromAPI(),
      fetchWalletBalance(),
      fetchBroadcastNotificationBadge(),
      loadHistoryFromBackend().catch(() => {}),
    ]);

    if (!hasApi) {
      setDashboardSummaryError('API non configurée (EXPO_PUBLIC_API_URL).');
    } else if (expectApi) {
      const nFail = [profileFailed, statsFailed, walletFailed].filter(Boolean).length;
      if (nFail >= 2) {
        setDashboardSummaryError('Connexion faible ou serveur indisponible. Tirez vers le bas pour réessayer.');
      } else if (nFail === 1) {
        setDashboardSummaryError('Certaines données n’ont pas pu être actualisées.');
      } else {
        setDashboardSummaryError(null);
      }
    } else {
      setDashboardSummaryError(null);
    }
  }, [loadHistoryFromBackend]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setIsDashboardRefreshing(true);
        setDashboardSummaryError(null);
        try {
          await loadDashboardData();
        } finally {
          if (!cancelled) {
            setIsDashboardRefreshing(false);
            setInitialDashboardLoadDone(true);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadDashboardData])
  );

  // Sync de la course actuelle
  useEffect(() => {
    syncCurrentRide().catch(() => { });
  }, [syncCurrentRide]);

  // Helper pour la distance locale
  const getDistanceToPickup = useCallback((pickupLat?: number, pickupLng?: number) => {
    if (!lastLat || !lastLng || !pickupLat || !pickupLng) return null;
    const R = 6371; // Radius of the earth in km
    const dLat = (pickupLat - lastLat) * Math.PI / 180;
    const dLon = (pickupLng - lastLng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lastLat * Math.PI / 180) * Math.cos(pickupLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d.toFixed(1);
  }, [lastLat, lastLng]);

  useEffect(() => {
    const now = Date.now();
    const ids = new Set(availableOffers.map((o) => o.id));
    for (const o of availableOffers) {
      if (offerFirstSeenMsRef.current[o.id] == null) {
        offerFirstSeenMsRef.current[o.id] = now;
      }
    }
    for (const key of Object.keys(offerFirstSeenMsRef.current)) {
      if (!ids.has(key)) {
        delete offerFirstSeenMsRef.current[key];
      }
    }
  }, [availableOffers]);

  useEffect(() => {
    if (availableOffers.length === 0) return;
    const interval = setInterval(() => setOfferTimerTick((t) => t + 1), 300);
    return () => clearInterval(interval);
  }, [availableOffers.length]);

  useEffect(() => {
    if (currentRide) {
      setOffersSheetOpen(false);
      prevOffersCountRef.current = availableOffers.length;
      return;
    }
    const n = availableOffers.length;
    if (n === 0) {
      setOffersSheetOpen(false);
      prevOffersCountRef.current = 0;
      return;
    }
    if (n > prevOffersCountRef.current) {
      setOffersSheetOpen(true);
    }
    prevOffersCountRef.current = n;
  }, [availableOffers, currentRide]);

  const getOfferTimerProgress = useCallback(
    (offerId: string) => {
      void offerTimerTick;
      const start = offerFirstSeenMsRef.current[offerId];
      if (start == null) return 1;
      const elapsed = Date.now() - start;
      return Math.max(0, Math.min(1, 1 - elapsed / OFFER_VISUAL_TTL_MS));
    },
    [offerTimerTick]
  );

  // Statistiques combinées (API values + live course status)
  const todayStats = useMemo(() => {
    const acceptedRideCount = (currentRide && (currentRide.status === 'pickup' || currentRide.status === 'incoming' || currentRide.status === 'ongoing')) ? 1 : 0;
    const pendingOffersCount = availableOffers.length;
    const scheduledRides = acceptedRideCount + pendingOffersCount;
    const activePart =
      acceptedRideCount === 0
        ? 'Aucun trajet actif'
        : acceptedRideCount === 1
          ? '1 trajet actif'
          : `${acceptedRideCount} trajets actifs`;
    const offerPart =
      pendingOffersCount === 0
        ? 'aucune offre'
        : pendingOffersCount === 1
          ? '1 offre'
          : `${pendingOffersCount} offres`;
    const activePlusOffersHint =
      acceptedRideCount + pendingOffersCount === 0
        ? 'Aucune course en cours ni offre'
        : `${activePart} · ${offerPart}`;

    return {
      completedRides: apiStats.todayRides,
      scheduledRides,
      activePlusOffersHint,
      totalEarnings: apiStats.todayEarnings,
      monthlyEarnings: apiStats.monthEarnings,
    };
  }, [apiStats, currentRide, availableOffers]);

  // GPS obligatoire pour se mettre en ligne : « Toujours autoriser » requis, sinon
  // l'odomètre ne mesure pas la distance réelle (suivi coupé écran verrouillé).
  // Bloque l'activation tant que la permission arrière-plan n'est pas accordée.
  const ensureLocationForOnline = useCallback(async (): Promise<boolean> => {
    try {
      let fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted' && fg.canAskAgain) {
        fg = await Location.requestForegroundPermissionsAsync();
      }
      if (fg.status !== 'granted') {
        Alert.alert(
          'Localisation requise',
          'Pour passer en ligne et recevoir des courses, autorise la localisation pour TIC Driver.',
          [
            { text: 'Plus tard', style: 'cancel' },
            { text: 'Réglages', onPress: () => Linking.openSettings().catch(() => {}) },
          ],
        );
        return false;
      }

      let bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status !== 'granted' && bg.canAskAgain) {
        bg = await Location.requestBackgroundPermissionsAsync();
      }
      if (bg.status !== 'granted') {
        Alert.alert(
          'Activez « Toujours autoriser »',
          "Pour passer en ligne, la localisation doit être réglée sur « Toujours autoriser ». Sinon le suivi GPS s'arrête dès l'écran verrouillé et tes courses ne sont pas mesurées.\n\nRéglages → Localisation → Toujours autoriser.",
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Ouvrir les réglages', onPress: () => Linking.openSettings().catch(() => {}) },
          ],
        );
        return false;
      }

      return true;
    } catch {
      // Erreur inattendue de l'API permission : on ne bloque pas (évite de coincer le chauffeur).
      return true;
    }
  }, []);

  // Toggle en ligne/hors ligne avec loading state
  const handleToggleOnline = useCallback(async () => {
    try {
      setIsTogglingOnline(true);
      const goingOnline = !online;
      // Garde GPS uniquement à l'activation ; le passage hors-ligne n'est jamais bloqué.
      if (goingOnline) {
        const ok = await ensureLocationForOnline();
        if (!ok) return;
      }
      await setOnline(goingOnline);
    } catch (error) {
      console.error('Erreur toggle online:', error);
    } finally {
      setIsTogglingOnline(false);
    }
  }, [online, setOnline, ensureLocationForOnline]);

  const handleAcceptOffer = useCallback(
    async (rideId: string) => {
      try {
        await acceptRequest(rideId);
        setOffersSheetOpen(false);
        // Accès DIRECT au détail de la course (plus de bouton « Détails » séparé).
        router.push({ pathname: '/incoming', params: { rideId } });
      } catch (e) {
        setOffersSheetOpen(false);
        if (e instanceof RideTakenError) {
          Alert.alert(
            'Course perdue',
            'Course récupérée par un zem plus rapide. Soyez plus rapide la prochaine fois.',
          );
        } else {
          Alert.alert('Acceptation impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
        }
      }
    },
    [acceptRequest, router]
  );




  // Navigation vers les différentes sections (mémorisées)
  const navigateToLocation = useCallback(async () => {
    try {
      debugLocationLog('permission');
      const { status } = await Location.requestForegroundPermissionsAsync();
      debugLocationLog('status', status);

      if (status !== 'granted') {
        Alert.alert(
          'Permission requise',
          'Activez la localisation pour voir votre position sur Google Maps.',
          [{ text: 'OK' }]
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      debugLocationLog('coords', latitude, longitude);

      const url = Platform.OS === 'ios'
        ? `http://maps.apple.com/?q=${latitude},${longitude}`
        : `geo:${latitude},${longitude}?q=${latitude},${longitude}`;

      const canOpen = await Linking.canOpenURL(url);

      if (canOpen) {
        await Linking.openURL(url);
      } else {
        const webUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
        debugLocationLog('fallback web');
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      if (__DEV__) console.error('[DriverDashboard] navigateToLocation', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      Alert.alert(
        'Erreur',
        `Impossible d'ouvrir Google Maps: ${errorMessage}`,
        [{ text: 'OK' }]
      );
    }
  }, []);

  const navigateToRides = useCallback(() => {
    router.push('/historique');
  }, [router]);

  const navigateToMonthlyEarnings = useCallback(() => {
    setShowMonthlyEarningsModal(true);
  }, []);

  const onRefreshDashboard = useCallback(async () => {
    setIsDashboardRefreshing(true);
    try {
      await loadDashboardData();
    } finally {
      setIsDashboardRefreshing(false);
    }
  }, [loadDashboardData]);

  const subscriptionRemaining = driverProfile?.subscription_remaining_rides ?? null;
  /** Avoir de l'argent = avoir l'abonnement (renouvellement auto côté serveur).
   *  Le popup n'apparaît que si solde + bonus ne couvrent pas les 500 F du pack. */
  const canAffordSubscription = walletBalance + walletBonus >= 500;
  const showSubscriptionModal =
    initialDashboardLoadDone &&
    subscriptionRemaining !== null &&
    subscriptionRemaining <= 3 &&
    !canAffordSubscription &&
    !subscriptionDismissed;

  const activeRideStage = currentRide
    ? currentRide.status === 'ongoing'
      ? 'Trajet en cours'
      : currentRide.status === 'arrived'
        ? 'Client rejoint'
        : currentRide.status === 'pickup'
          ? 'En route vers le client'
          : 'Course acceptée'
    : '';
  const activeRideTarget = currentRide
    ? (currentRide.status === 'ongoing' || currentRide.status === 'arrived'
      ? currentRide.dropoff
      : currentRide.pickup) || 'Ouvrir le détail de la course'
    : '';
  const activeRideService = currentRide?.service_type === 'livraison' ? 'Livraison' : 'Course zem';

  React.useEffect(() => {
    // Réarme le popup une fois la situation rétablie (recharge ou pack reconstitué).
    if (subscriptionDismissed && (canAffordSubscription || (subscriptionRemaining !== null && subscriptionRemaining > 3))) {
      setSubscriptionDismissed(false);
    }
  }, [subscriptionRemaining, subscriptionDismissed, canAffordSubscription]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#37BD6B" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isDashboardRefreshing && initialDashboardLoadDone}
            onRefresh={onRefreshDashboard}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Top sheet vert : en-tête + solde réunis */}
        <DriverBalanceCard
          topInset={insets.top}
          balance={walletBalance}
          bonus={walletBonus}
          onRecharge={() => router.push('/wallet-topup')}
          header={
            <View style={styles.sheetHeader}>
              <TouchableOpacity
                onPress={() => router.push('/driver-menu')}
                style={styles.headerAvatar}
                accessibilityRole="button"
                accessibilityLabel={`Menu compte chauffeur, ${driverName}`}
                accessibilityHint="Ouvre le menu et les réglages du compte"
              >
                <LinearGradient colors={Gradients.primary} style={styles.avatarIcon}>
                  {driverPhoto ? (
                    <Image source={{ uri: driverPhoto }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={20} color="white" />
                  )}
                </LinearGradient>
                <View>
                  <Text style={styles.headerGreetingLight}>Bonjour,</Text>
                  <Text style={styles.headerNameLight}>{driverName}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push('/notifications')}
                style={styles.iconButtonGreen}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                accessibilityHint={
                  hasUnreadBroadcastNotifications ? 'Nouvelles annonces non consultées' : undefined
                }
              >
                <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
                {hasUnreadBroadcastNotifications ? <View style={styles.dotIndicator} /> : null}
              </TouchableOpacity>
            </View>
          }
        />

        <View style={styles.mainContent}>

          <BackgroundLocationBanner />

          {dashboardSummaryError ? (
            <View style={styles.summaryErrorBanner} accessibilityRole="alert">
              <Ionicons name="warning-outline" size={18} color={Colors.warning} />
              <Text style={styles.summaryErrorText}>{dashboardSummaryError}</Text>
            </View>
          ) : null}

          {/* Contrôle principal : casque « en ligne / hors ligne » */}
          <View style={styles.helmetPanel}>
            <HelmetOnlineToggle
              isOnline={online}
              onToggle={handleToggleOnline}
              loading={isTogglingOnline}
            />
          </View>

          {!currentRide && availableOffers.length > 0 && !offersSheetOpen ? (
            <TouchableOpacity
              style={[styles.offersInlineBar, Shadows.lg]}
              activeOpacity={0.92}
              onPress={() => setOffersSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${availableOffers.length} offre${availableOffers.length > 1 ? 's' : ''} à proximité, ouvrir`}
            >
              <LinearGradient colors={Gradients.primary as [string, string]} style={styles.offersInlineGradient}>
                <View style={styles.offersInlineIconWrap}>
                  <Ionicons name="notifications" size={22} color="white" />
                  <View style={styles.offersInlineBadge}>
                    <Text style={styles.offersInlineBadgeText}>
                      {availableOffers.length > 9 ? '9+' : availableOffers.length}
                    </Text>
                  </View>
                </View>
                <View style={styles.offersInlineTextCol}>
                  <Text style={styles.offersInlineTitle}>Offres</Text>
                  <Text style={styles.offersInlineSub}>
                    {availableOffers.length} nouvelle{availableOffers.length > 1 ? 's' : ''} demande
                    {availableOffers.length > 1 ? 's' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-up" size={22} color="rgba(255,255,255,0.85)" />
              </LinearGradient>
            </TouchableOpacity>
          ) : null}

          {/* COURSE ACTIVE */}
          {currentRide && (
            <TouchableOpacity
              style={styles.activeRideBox}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={`Course en cours, statut ${currentRide.status}`}
              accessibilityHint="Ouvre l’écran de la course active"
              onPress={() => {
                 if (currentRide.status === 'incoming' || currentRide.status === 'pickup') {
                   // Écran détail = hub après acceptation ; « Aller chercher » y mène à la carte.
                   router.push({ pathname: '/incoming', params: { rideId: currentRide.id } });
                 } else if (currentRide.status === 'arrived') {
                   router.push('/pickup');
                 } else if (currentRide.status === 'ongoing') {
                   router.push('/pickup');
                 }
              }}
            >
              <LinearGradient
                colors={['#161616', '#282828']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.activeRideGradient}
              >
                <View style={styles.activeRideAccent} />
                <View style={styles.activeRideMain}>
                  <View style={styles.activeIconCircle}>
                    <Ionicons
                      name={currentRide.service_type === 'livraison' ? 'cube-outline' : 'navigate'}
                      size={22}
                      color={Colors.dark}
                    />
                  </View>
                  <View style={styles.activeInfo}>
                    <View style={styles.activeStatusRow}>
                      <View style={styles.activeLiveDot} />
                      <Text style={styles.activeStatus}>{activeRideStage}</Text>
                    </View>
                    <Text style={styles.activeTarget} numberOfLines={1}>{activeRideTarget}</Text>
                  </View>
                  <View style={styles.activeResumeButton}>
                    <Text style={styles.activeResumeText}>Reprendre</Text>
                    <Ionicons name="arrow-forward" size={17} color={Colors.dark} />
                  </View>
                </View>
                <View style={styles.activeRideFooter}>
                  <View style={styles.activeMetaItem}>
                    <Ionicons
                      name={currentRide.service_type === 'livraison' ? 'cube-outline' : 'bicycle-outline'}
                      size={15}
                      color="rgba(255,255,255,0.64)"
                    />
                    <Text style={styles.activeMetaText}>{activeRideService}</Text>
                  </View>
                  <View style={styles.activeMetaDivider} />
                  <Text style={styles.activeFare}>
                    {Number(currentRide.negotiated_fare ?? currentRide.fare ?? 0).toLocaleString('fr-FR')} FCFA
                  </Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>

      {!currentRide ? (
        <DriverOffersBottomSheet
          visible={offersSheetOpen}
          onClose={() => setOffersSheetOpen(false)}
          offers={availableOffers}
          driverName={driverName}
          getDistanceToPickup={getDistanceToPickup}
          getOfferTimerProgress={getOfferTimerProgress}
          onAccept={handleAcceptOffer}
        />
      ) : null}

      {/* POPUP ABONNEMENT */}
      <SubscriptionModal
        visible={showSubscriptionModal}
        remainingRides={subscriptionRemaining ?? 0}
        onRecharge={() => {
          setSubscriptionDismissed(true);
          router.push({ pathname: '/wallet-topup', params: { minAmount: '500' } });
        }}
        onClose={() => setSubscriptionDismissed(true)}
      />

      {/* MODALE GAINS MENSUELS */}
      <MonthlyEarningsModal
        visible={showMonthlyEarningsModal}
        onClose={() => setShowMonthlyEarningsModal(false)}
        monthlyEarnings={apiStats.monthEarnings}
        totalRevenue={apiStats.monthFare}
        completedRidesCount={apiStats.monthRides}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  /* HEADER PREMIUM */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
    backgroundColor: 'white',
  },
  headerAvatar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  headerGreeting: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.gray,
  },
  headerName: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.black,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
    borderWidth: 2,
    borderColor: 'white',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerGreetingLight: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  headerNameLight: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  iconButtonGreen: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* CONTENT */
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 130, // dégage la barre d'onglets flottante
  },
  mainContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  /* SECTIONS */
  topSection: {
    marginBottom: 8,
  },
  topCardGap: {
    height: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
    gap: 12,
  },
  summaryErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  summaryErrorText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: '#5D4037',
    lineHeight: 18,
  },
  statSkeleton: {
    flex: 1,
    backgroundColor: '#ECECEC',
    borderRadius: 20,
    minHeight: 120,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.black,
  },

  /* GRID STATS */
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },

  /* TOGGLE */
  toggleWrapper: {
    marginBottom: 8,
  },
  helmetPanel: {
    backgroundColor: '#FDD835',
    borderRadius: 28,
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
  },

  offersInlineBar: {
    borderRadius: 20,
    overflow: 'hidden' as const,
    marginBottom: 16,
  },
  offersInlineGradient: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  offersInlineIconWrap: {
    position: 'relative' as const,
  },
  offersInlineBadge: {
    position: 'absolute' as const,
    top: -6,
    right: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.error,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: 'white',
  },
  offersInlineBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: 'white',
  },
  offersInlineTextCol: {
    flex: 1,
  },
  offersInlineTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: 'white',
  },
  offersInlineSub: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
  },

  /* FAST ACTIONS */
  fastActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },

  /* ACTIVE RIDE */
  activeRideBox: {
    marginTop: 12,
    marginBottom: 6,
    borderRadius: 22,
    overflow: 'hidden' as const,
    shadowColor: '#111111',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 7,
  },
  activeRideGradient: {
    position: 'relative' as const,
    overflow: 'hidden' as const,
    padding: 15,
  },
  activeRideAccent: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    left: 0,
    width: 5,
    backgroundColor: Colors.primary,
  },
  activeRideMain: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 11,
  },
  activeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  activeInfo: {
    flex: 1,
    minWidth: 0,
  },
  activeStatusRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  activeLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#45D576',
  },
  activeStatus: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  activeTarget: {
    marginTop: 3,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.62)',
  },
  activeResumeButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  activeResumeText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: Colors.dark,
  },
  activeRideFooter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 13,
    paddingTop: 11,
    paddingLeft: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  activeMetaItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  activeMetaText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.64)',
  },
  activeMetaDivider: {
    width: 4,
    height: 4,
    marginHorizontal: 9,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  activeFare: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.primary,
  },

  /* SUBSCRIPTION */
  subscriptionBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  subscriptionAlert: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  subscriptionActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  subscriptionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.black,
  },
  subscriptionDesc: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  subscriptionRenewBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  subscriptionRenewBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.black,
  },
});
