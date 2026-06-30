import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Linking,
  Alert,
  Dimensions,
  StatusBar,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useDriverStore } from '../providers/DriverProvider';
import { Audio } from 'expo-av';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../theme';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  Easing,
  withRepeat,
  withSequence,
  FadeInDown,
  FadeIn
} from 'react-native-reanimated';
import { Fonts } from '../../font';
import { LinearGradient } from 'expo-linear-gradient';
import { getImageUrl, withImageVersion } from '../utils/images';
import { apiFetch } from '../utils/apiClient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const GENERIC_PICKUP_REGEX = /^(ma position|my location|position actuelle|current location)$/i;

const formatCoord = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(6) : '--';

export default function IncomingRequest() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId: paramRideId } = useLocalSearchParams<{ rideId: string }>();
  const { currentRide, availableOffers, acceptRequest, declineRequest, syncCurrentRide } = useDriverStore();

  const targetRide = useMemo(() => {
    if (currentRide && String(currentRide.id) === String(paramRideId)) return currentRide;
    if (availableOffers) {
      return availableOffers.find(r => String(r.id) === String(paramRideId)) || currentRide;
    }
    return currentRide;
  }, [currentRide, availableOffers, paramRideId]);

  const [seconds, setSeconds] = useState(300);
  const soundRef = useRef<Audio.Sound | null>(null);
  const riderVoiceSoundRef = useRef<Audio.Sound | null>(null);
  const [riderVoiceLoading, setRiderVoiceLoading] = useState(false);
  const [riderVoicePlaying, setRiderVoicePlaying] = useState(false);
  const declineCalledRef = useRef(false);
  const [pickupZoneLabel, setPickupZoneLabel] = useState<string | null>(null);

  const rideId = targetRide?.id ?? null;
  const isIncoming = targetRide?.status === 'incoming';

  // Reset timer and flags when ride changes
  useEffect(() => {
    if (rideId && isIncoming) {
      setSeconds(300);
      declineCalledRef.current = false;
      console.log(`[IncomingRequest] New ride detected: ${rideId}. Timer reset.`);
    }
  }, [rideId, isIncoming]);

  useEffect(() => {
    const rawPickup = (targetRide?.pickup || '').trim();
    const isGenericPickup = GENERIC_PICKUP_REGEX.test(rawPickup);
    const lat = targetRide?.pickupLat;
    const lon = targetRide?.pickupLon;

    if (!targetRide || !isGenericPickup || typeof lat !== 'number' || typeof lon !== 'number') {
      setPickupZoneLabel(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/geocoding/reverse?lat=${lat}&lon=${lon}&language=fr`,
          { skipAuth: true },
        );
        if (!res?.ok || cancelled) return;
        const json = await res.json().catch(() => null);
        const zone =
          (typeof json?.zone_title === 'string' && json.zone_title.trim()) ||
          (typeof json?.zone_label === 'string' && json.zone_label.trim()) ||
          (typeof json?.address === 'string' && json.address.trim()) ||
          null;
        if (!cancelled) setPickupZoneLabel(zone);
      } catch {
        if (!cancelled) setPickupZoneLabel(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetRide?.id, targetRide?.pickup, targetRide?.pickupLat, targetRide?.pickupLon]);

  // Animations
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.5);

  useEffect(() => {
    ringScale.value = withRepeat(
      withTiming(1.5, { duration: 1500, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
    ringOpacity.value = withRepeat(
      withTiming(0, { duration: 1500, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
  }, []);

  const animatedRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const formattedTime = useMemo(() => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [seconds]);

  // === Gestion du son et timer ===
  const stopRingtone = useCallback(async () => {
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch { }
    soundRef.current = null;
  }, []);

  const stopRiderVoicePlayback = useCallback(async () => {
    try {
      await riderVoiceSoundRef.current?.stopAsync();
      await riderVoiceSoundRef.current?.unloadAsync();
    } catch { }
    riderVoiceSoundRef.current = null;
    setRiderVoicePlaying(false);
    setRiderVoiceLoading(false);
  }, []);

  const toggleRiderVoicePlayback = useCallback(async () => {
    const path = targetRide?.riderVoiceAudioPath;
    if (!path) return;
    if (riderVoicePlaying) {
      await stopRiderVoicePlayback();
      return;
    }
    const uri = getImageUrl(path);
    if (!uri) {
      Alert.alert('Message vocal', 'Impossible de charger le fichier audio.');
      return;
    }
    await stopRiderVoicePlayback();
    setRiderVoiceLoading(true);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            stopRiderVoicePlayback().catch(() => { });
          }
        },
      );
      riderVoiceSoundRef.current = sound;
      setRiderVoicePlaying(true);
    } catch (e) {
      console.warn('[IncomingRequest] Lecture message passager:', e);
      Alert.alert('Message vocal', 'Lecture impossible.');
    } finally {
      setRiderVoiceLoading(false);
    }
  }, [targetRide?.riderVoiceAudioPath, riderVoicePlaying, stopRiderVoicePlayback]);

  useEffect(() => {
    if (!currentRide) {
      syncCurrentRide().catch(() => { });
    }
  }, [currentRide, syncCurrentRide]);

  useEffect(() => {
    if (!rideId || !isIncoming) {
      stopRingtone();
      return;
    }

    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/ride.wav'),
          { isLooping: true, volume: 1.0 }
        );
        soundRef.current = sound;
        await sound.playAsync();
      } catch (e) {
        console.warn('[IncomingRequest] Sonnerie locale impossible:', e);
      }
    })();

    const interval = setInterval(() => {
      setSeconds(s => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(interval);
      stopRingtone();
      stopRiderVoicePlayback().catch(() => { });
    };
  }, [rideId, isIncoming, stopRingtone, stopRiderVoicePlayback]);

  useEffect(() => {
    if (seconds === 0 && rideId && isIncoming && !declineCalledRef.current) {
      declineCalledRef.current = true;
      console.log(`[IncomingRequest] Timer expired for ride: ${rideId}. Auto-declining.`);
      declineRequest(String(rideId)).catch(() => { });
      stopRingtone();
      router.replace('/(tabs)');
    }
  }, [seconds, rideId, isIncoming, declineRequest, stopRingtone, router]);

  useEffect(() => {
    if (currentRide?.status === 'pickup') {
      router.replace('/pickup');
    } else if (!currentRide && !isIncoming) {
      router.replace('/(tabs)');
    }
  }, [currentRide?.status, currentRide, isIncoming, router]);

  if (!rideId || !targetRide) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar barStyle="dark-content" />
        <Ionicons name="notifications-off-outline" size={80} color={Colors.lightGray} />
        <Text style={styles.emptyText}>Cette offre n'est plus disponible</Text>
        <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.homeBtnText}>Retour au tableau de bord</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pickupRaw = (targetRide.pickup ?? '').trim();
  const isGenericPickup = GENERIC_PICKUP_REGEX.test(pickupRaw);
  const pickup = isGenericPickup
    ? (pickupZoneLabel || 'Zone du client')
    : (pickupRaw || 'Point de départ inconnu');
  const dropoff = targetRide.dropoff ?? 'Destination inconnue';
  const pickupCoords =
    typeof targetRide.pickupLat === 'number' && typeof targetRide.pickupLon === 'number'
      ? `${formatCoord(targetRide.pickupLat)}, ${formatCoord(targetRide.pickupLon)}`
      : null;
  const fare = `${targetRide.fare.toLocaleString('fr-FR')} F`;
  const passengerName = targetRide.riderName ?? 'Passager';
  const passengerPhone = targetRide.riderPhone;
  const passengerPhoto = targetRide.riderPhoto;
  const passengerPhotoUri = passengerPhoto
    ? withImageVersion(getImageUrl(passengerPhoto), rideId ?? passengerPhone ?? passengerName)
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[Colors.primary, '#1e2d7d']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.screenBody, { paddingBottom: insets.bottom + 10 }]}>
        {/* Top Section: Timer */}
        <View style={styles.timerSection}>
          <View style={styles.timerOuter}>
            <Animated.View style={[styles.pulseRing, animatedRingStyle]} />
            <View style={styles.timerInner}>
              <Text style={styles.timerLabel}>EXPIRE DANS</Text>
              <Text style={styles.timerValue}>{formattedTime}</Text>
            </View>
          </View>
        </View>

        {/* Middle Section: Ride Info Card */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(600)}
          style={styles.mainCard}
        >
          {/* Fare & Service */}
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.fareLabel}>Gain estimé</Text>
              <Text style={styles.fareValue}>{fare}</Text>
            </View>
            <View style={[
              styles.badge,
              targetRide.service_type === 'livraison' ? styles.deliveryBadge :
                targetRide.service_type === 'deplacement' ? styles.ticBadge :
                  targetRide.vehicle_type === 'vip' ? styles.vipBadge :
                    styles.standardBadge
            ]}>
              <MaterialCommunityIcons
                name={
                  targetRide.service_type === 'livraison' ? "package-variant" :
                    targetRide.service_type === 'deplacement' ? "bus-clock" :
                      targetRide.vehicle_type === 'vip' ? "crown" : "car"
                }
                size={16}
                color={
                  targetRide.service_type === 'livraison' ? "#F97316" :
                    targetRide.service_type === 'deplacement' ? Colors.secondary :
                      targetRide.vehicle_type === 'vip' ? "#FFD700" : Colors.primary
                }
              />
              <Text style={[
                styles.badgeText,
                targetRide.service_type === 'livraison' ? styles.deliveryText :
                  targetRide.service_type === 'deplacement' ? styles.ticText :
                    targetRide.vehicle_type === 'vip' ? styles.vipText :
                      styles.standardText
              ]}>
                {
                  targetRide.service_type === 'livraison' ? 'LIVRAISON' :
                    targetRide.service_type === 'deplacement' ? 'COURSE TIC' :
                      targetRide.vehicle_type === 'vip' ? 'VIP LUXE' : 'STANDARD'
                }
              </Text>
            </View>
          </View>

          {/* Route Section */}
          <View style={styles.routeSection}>
            <View style={[styles.routeItem, styles.routeItemPickup]}>
              <View style={[styles.routeIcon, { backgroundColor: '#10B981' }]}>
                <Ionicons name="location" size={14} color="#fff" />
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeLabel}>DÉPART</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>{pickup}</Text>
                {pickupCoords ? (
                  <View style={styles.routeMetaRow}>
                    <Ionicons name="navigate-outline" size={12} color={Colors.mediumGray} />
                    <Text style={styles.routeMetaText}>GPS: {pickupCoords}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.routeConnector}>
              <View style={styles.connectorLine} />
            </View>

            <View style={[styles.routeItem, styles.routeItemDropoff]}>
              <View style={[styles.routeIcon, { backgroundColor: Colors.secondary }]}>
                <Ionicons name="flag" size={14} color="#fff" />
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeLabel}>DESTINATION</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>{dropoff}</Text>
              </View>
            </View>
          </View>

          {/* Special Requests */}
          {targetRide.has_baggage && (
            <View style={styles.baggageNote}>
              <MaterialCommunityIcons name="bag-checked" size={18} color={Colors.secondary} />
              <Text style={styles.baggageNoteText}>Le passager a des bagages</Text>
            </View>
          )}

          {(targetRide.riderVoiceNote || targetRide.riderVoiceAudioPath) ? (
            <View style={styles.passengerMessageBox}>
              <Ionicons name="mic-outline" size={18} color={Colors.primary} style={styles.passengerMessageIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.passengerMessageLabel}>Message passager</Text>
                {targetRide.riderVoiceNote ? (
                  <Text style={styles.passengerMessageText} numberOfLines={2}>
                    {targetRide.riderVoiceNote}
                  </Text>
                ) : (
                  <Text style={styles.passengerMessageTextMuted}>Consigne uniquement vocale (langue locale possible).</Text>
                )}
                {targetRide.riderVoiceAudioPath ? (
                  <TouchableOpacity
                    style={styles.voicePlayRow}
                    onPress={() => toggleRiderVoicePlayback().catch(() => { })}
                    accessibilityLabel={riderVoicePlaying ? 'Pause message vocal' : 'Écouter le message vocal du passager'}
                  >
                    {riderVoiceLoading ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons
                        name={riderVoicePlaying ? 'pause-circle' : 'play-circle'}
                        size={28}
                        color={Colors.primary}
                      />
                    )}
                    <Text style={styles.voicePlayLabel}>
                      {riderVoicePlaying ? 'Pause' : 'Écouter le vocal'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Passenger Preview */}
          <View style={styles.passengerPreview}>
            <View style={styles.avatar}>
              {passengerPhotoUri ? (
                <Image
                  source={{ uri: passengerPhotoUri }}
                  style={styles.avatarImage}
                />
              ) : (
                <Text style={styles.avatarText}>{passengerName.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.passengerInfo}>
              <Text style={styles.passengerNameText}>{passengerName}</Text>
              {passengerPhone ? (
                <TouchableOpacity
                  style={styles.ratingRow}
                  onPress={() => Linking.openURL(`tel:${passengerPhone}`)}
                >
                  <Ionicons name="call-outline" size={14} color={Colors.primary} />
                  <Text style={styles.ratingText}>{passengerPhone}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(600)}
          style={styles.actionSection}
        >
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={async () => {
              await declineRequest(String(rideId));
              stopRingtone();
              router.replace('/(tabs)');
            }}
          >
            <Ionicons name="close" size={28} color="#fff" />
            <Text style={styles.actionText}>Ignorer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={async () => {
              if (!isIncoming) return;
              stopRingtone();
              try {
                // On attend que l'acceptation soit validée et enregistrée dans le store global
                const offer = availableOffers.find(o => String(o.id) === String(rideId));
                await acceptRequest(String(rideId));
                if (offer && offer.pricing_mode === 'negotiable') {
                  router.replace({ pathname: '/ride/negotiation', params: { rideId: String(rideId) } });
                } else {
                  router.replace('/pickup');
                }
              } catch (err) {
                Alert.alert('Erreur', 'L’offre n’est plus disponible.');
              }
            }}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.acceptGradient}
            >
              <Ionicons name="checkmark-sharp" size={32} color="#fff" />
              <Text style={styles.acceptBtnText}>ACCEPTER</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 16 },
  screenBody: {
    flex: 1,
    paddingTop: 4,
    justifyContent: 'space-between',
    minHeight: 0,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    color: Colors.black,
    marginTop: 20,
    textAlign: 'center',
  },
  homeBtn: {
    marginTop: 30,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  homeBtnText: {
    color: '#fff',
    fontFamily: Fonts.bold,
    fontSize: 16,
  },

  // Timer Section
  timerSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  timerOuter: {
    width: 112,
    height: 112,
    borderRadius: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  timerInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: Fonts.bold,
    marginBottom: 4,
  },
  timerValue: {
    color: '#fff',
    fontSize: 24,
    fontFamily: Fonts.bold,
    fontVariant: ['tabular-nums'],
  },

  // Main Card
  mainCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 10,
    flex: 1,
    minHeight: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  fareLabel: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.gray,
    marginBottom: 2,
  },
  fareValue: {
    fontFamily: Fonts.bold,
    fontSize: 30,
    color: Colors.black,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 5,
  },
  vipBadge: { backgroundColor: '#FFF9E6' },
  standardBadge: { backgroundColor: '#F0F4FF' },
  deliveryBadge: { backgroundColor: '#FFF7ED' },
  ticBadge: { backgroundColor: '#EEF2FF' },
  badgeText: { fontSize: 11, fontFamily: Fonts.bold },
  vipText: { color: '#B45309' },
  standardText: { color: Colors.primary },
  deliveryText: { color: '#F97316' },
  ticText: { color: Colors.secondary },

  // Route Section
  routeSection: {
    marginBottom: 10,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  routeItemPickup: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  routeItemDropoff: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  routeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  routeContent: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Colors.gray,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.black,
    lineHeight: 18,
  },
  routeMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routeMetaText: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: Colors.mediumGray,
  },
  routeConnector: {
    width: 28,
    alignItems: 'center',
    marginVertical: 4,
  },
  connectorLine: {
    width: 2,
    height: 16,
    backgroundColor: '#F3F4F6',
    borderStyle: 'dashed',
    borderRadius: 1,
  },

  // Extras
  baggageNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    padding: 10,
    borderRadius: 12,
    gap: 10,
    marginBottom: 10,
  },
  baggageNoteText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: '#9A3412',
  },
  passengerMessageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  passengerMessageIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  passengerMessageLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  passengerMessageText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: '#1e293b',
    lineHeight: 18,
  },
  passengerMessageTextMuted: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: '#64748b',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  voicePlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingVertical: 4,
  },
  voicePlayLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },

  // Passenger Preview
  passengerPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 11,
    borderRadius: 14,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: Fonts.bold,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  passengerInfo: {
    flex: 1,
  },
  passengerNameText: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.black,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 11,
    color: Colors.gray,
    fontFamily: Fonts.regular,
  },

  // Actions
  actionSection: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  declineBtn: {
    width: 82,
    height: 68,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Fonts.bold,
    marginTop: 4,
  },
  acceptBtn: {
    flex: 1,
    height: 68,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  acceptGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
  },
});