import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
  Share,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Shadows } from '../theme';
import { Fonts } from '../font';
import { getImageUrl, withImageVersion } from './utils/images';
import { openNavigation } from './utils/openExternalUrl';

// ─── ErrorBoundary ──────────────────────────────────────────────────────────
type EBState = { hasError: boolean; message: string };
class RideOngoingErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: unknown): EBState {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown, info: unknown) {
    console.error('[RideOngoingScreen] Render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 32 }}>
          <Ionicons name="warning-outline" size={56} color="#EF4444" />
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16, textAlign: 'center' }}>
            Oops — écran en cours
          </Text>
          <Text style={{ fontSize: 14, color: '#64748b', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            Une erreur inattendue s'est produite. Touchez « Réessayer » pour recharger.
          </Text>
          {__DEV__ && (
            <Text style={{ fontSize: 10, color: '#ef4444', marginTop: 12, fontFamily: 'monospace', textAlign: 'center' }}>
              {this.state.message}
            </Text>
          )}
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#3b82f6', borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Réessayer</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

import { useDriverStore } from './providers/DriverProvider';
import { Mapbox } from './utils/mapboxInit';
import { useMapVisible } from './hooks/useMapVisible';
import * as Location from 'expo-location';
import { fetchRouteOSRM } from './utils/osrm';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  subscribeToNetworkChanges,
  saveRideState,
  showNetworkErrorAlert,
  checkNetworkConnection
} from './utils/networkHandler';


export default function DriverRideOngoing() {
  return (
    <RideOngoingErrorBoundary>
      <RideOngoingScreenInner />
    </RideOngoingErrorBoundary>
  );
}

function RideOngoingScreenInner() {
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentRide, completeRide, syncCurrentRide, startStop, endStop, navPref } = useDriverStore();
  const [loadingComplete, setLoadingComplete] = React.useState(false);

  React.useEffect(() => {
    if (!currentRide) {
      const timer = setTimeout(() => {
        router.replace('/(tabs)');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentRide, router]);

  const isMounted = React.useRef(true);
  React.useEffect(() => () => { isMounted.current = false; }, []);

  const [eta, setEta] = React.useState<number | null>(null);
  const [distance, setDistance] = React.useState<number | null>(null);
  const [myLoc, setMyLoc] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [routeCoords, setRouteCoords] = React.useState<{ latitude: number; longitude: number }[]>([]);
  const [isOnline, setIsOnline] = React.useState(true);
  const [liveStopSeconds, setLiveStopSeconds] = React.useState<number>(0);
  const [mapReady, setMapReady] = React.useState(false);
  const mapVisible = useMapVisible();

  // Filet de sécurité Mapbox : Forcer mapReady à true après 3 secondes quoi qu'il arrive (problème réseau ou native callback manqué)
  React.useEffect(() => {
    const safetyTimer = setTimeout(() => {
      if (!mapReady) {
        setMapReady(true);
      }
    }, 3000);
    return () => clearTimeout(safetyTimer);
  }, [mapReady]);
  const SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.78);
  const COLLAPSED_VISIBLE = Math.round(SCREEN_HEIGHT * 0.4);
  const COLLAPSED_Y = Math.max(0, SHEET_HEIGHT - COLLAPSED_VISIBLE);
  const sheetY = React.useRef(new Animated.Value(COLLAPSED_Y)).current;
  const sheetYRef = React.useRef(COLLAPSED_Y);

  const cameraRef = React.useRef<Mapbox.Camera>(null);

  const clampSheetY = React.useCallback(
    (value: number) => Math.min(COLLAPSED_Y, Math.max(0, value)),
    [COLLAPSED_Y],
  );

  const sheetPanResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => {
        sheetY.stopAnimation((v: number) => {
          sheetYRef.current = clampSheetY(v);
        });
      },
      onPanResponderMove: (_, gesture) => {
        sheetY.setValue(clampSheetY(sheetYRef.current + gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        sheetY.stopAnimation((v: number) => {
          const current = clampSheetY(v);
          const projected = clampSheetY(current + gesture.vy * 28);
          const snap = projected > COLLAPSED_Y / 2 ? COLLAPSED_Y : 0;
          Animated.spring(sheetY, {
            toValue: snap,
            useNativeDriver: true,
            bounciness: 0,
            speed: 18,
          }).start(() => {
            sheetYRef.current = snap;
          });
        });
      },
    }),
  ).current;

  const openExternalNav = (lat: number, lon: number) =>
    openNavigation(lat, lon, navPref === 'waze' ? 'waze' : 'gmaps');

  React.useEffect(() => {
    const t = setInterval(() => {
      if (eta && eta > 1) setEta((e) => (e ? Math.max(1, e - 1) : e));
    }, 60000);
    return () => clearInterval(t);
  }, [eta]);

  React.useEffect(() => {
    checkNetworkConnection().then(state => { if (isMounted.current) setIsOnline(state.isConnected); });
    const unsubscribe = subscribeToNetworkChanges((state) => {
      const wasOnline = isOnline;
      setIsOnline(state.isConnected);
      if (!state.isConnected && wasOnline && currentRide) {
        saveRideState(currentRide).catch(() => { });
        showNetworkErrorAlert(true);
      } else if (state.isConnected && !wasOnline && currentRide) {
        syncCurrentRide().catch(() => { });
      }
    });
    return unsubscribe;
  }, [isOnline, currentRide, syncCurrentRide]);

  React.useEffect(() => {
    if (!currentRide) return;
    const syncInterval = setInterval(() => {
      if (isOnline) {
        syncCurrentRide().catch(() => { });
      }
      saveRideState(currentRide).catch(() => { });
    }, 30000);
    return () => clearInterval(syncInterval);
  }, [currentRide, isOnline, syncCurrentRide]);

  React.useEffect(() => {
    let interval: any;
    if (currentRide?.stop_started_at) {
      const start = new Date(currentRide.stop_started_at).getTime();
      interval = setInterval(() => {
        const now = Date.now();
        setLiveStopSeconds(Math.floor((now - start) / 1000));
      }, 1000);
    } else {
      setLiveStopSeconds(0);
    }
    return () => clearInterval(interval);
  }, [currentRide?.stop_started_at]);

  const formatDuration = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  React.useEffect(() => {
    // Set ETA immediately from backend data as fallback
    if (currentRide?.duration_s && !eta) {
      setEta(Math.ceil(currentRide.duration_s / 60));
    }
    // Set Distance immediately from backend data if available
    if (currentRide?.distance_m && !distance) {
      setDistance(currentRide.distance_m / 1000);
    }

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({});
        const me = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        if (isMounted.current) setMyLoc(me);

        if (currentRide?.dropoffLat && currentRide?.dropoffLon) {
          if (!distance) {
            const dx = currentRide.dropoffLon - me.longitude;
            const dy = currentRide.dropoffLat - me.latitude;
            const straightLineKm = Math.sqrt(dx * dx + dy * dy) * 111;
            if (isMounted.current) setDistance(straightLineKm * 1.3);
          }

          try {
            const result = await fetchRouteOSRM(me, {
              latitude: Number(currentRide.dropoffLat),
              longitude: Number(currentRide.dropoffLon),
            });
            if (!isMounted.current) return;
            setRouteCoords(result);
            if (result.length > 1) {
              const estimatedDistanceKm = result.reduce((acc: number, curr: any, idx: number, arr: any[]) => {
                if (idx === 0) return 0;
                const prev = arr[idx - 1];
                const rdx = curr.longitude - prev.longitude;
                const rdy = curr.latitude - prev.latitude;
                return acc + Math.sqrt(rdx * rdx + rdy * rdy);
              }, 0) * 111;
              setDistance(estimatedDistanceKm);
            }
          } catch {
            console.log('[RideOngoing] OSRM route fetch failed, using straight-line distance');
          }

          if (isMounted.current && currentRide.duration_s) {
            setEta(Math.ceil(currentRide.duration_s / 60));
          }
        }
      } catch {
        console.log('[RideOngoing] Location/route calculation failed');
      }
    })();
  }, [currentRide?.dropoffLat, currentRide?.dropoffLon, currentRide?.duration_s]);

  if (!currentRide) return null;

  const riderPhotoUri = currentRide.riderPhoto
    ? withImageVersion(getImageUrl(currentRide.riderPhoto), currentRide.id ?? currentRide.riderName)
    : null;
  const dropoffShort = currentRide.order_mode === 'duration'
    ? `⏱ Location horaire (${currentRide.duration_hours}h)`
    : (currentRide.dropoff && currentRide.dropoff.length > 42
      ? `${currentRide.dropoff.slice(0, 40)}…`
      : currentRide.dropoff);

  const routeSource = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: routeCoords.map(c => [c.longitude, c.latitude]),
    },
  } as any;

  // PERF-OOM-02 : Mémoïser centerCoordinate pour éviter un rendu en boucle infini
  // de la caméra Mapbox (qui causait des plantages OutOfMemory sur Android/Xiaomi).
  // Sécurisé contre les valeurs NaN/invalides qui peuvent faire crasher la carte native (Écran blanc).
  const memoizedCenterCoordinate = React.useMemo(() => {
    const defaultLon = 2.39;
    const defaultLat = 6.37;
    const dLon = Number(currentRide?.dropoffLon);
    const dLat = Number(currentRide?.dropoffLat);
    const mLon = Number(myLoc?.longitude);
    const mLat = Number(myLoc?.latitude);

    const lon = Number.isFinite(mLon) ? mLon : (Number.isFinite(dLon) ? dLon : defaultLon);
    const lat = Number.isFinite(mLat) ? mLat : (Number.isFinite(dLat) ? dLat : defaultLat);
    return [lon, lat];
  }, [myLoc?.longitude, myLoc?.latitude, currentRide?.dropoffLon, currentRide?.dropoffLat]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Premium */}
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={styles.phaseStrip}>
            <Ionicons name="navigate-circle" size={16} color={Colors.primary} />
            <Text style={styles.phaseStripText}>Navigation vers la destination</Text>
          </View>
          <Text style={styles.screenTitle}>Course en cours</Text>
          <Text style={styles.screenSubtitle} numberOfLines={2}>
            {dropoffShort || 'Destination'}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10B981' : Colors.error }]} />
            <Text style={styles.statusText}>{isOnline ? 'Synchronisé' : 'Hors ligne'}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.shareBtn}
          accessibilityRole="button"
          accessibilityLabel="Partager le trajet"
          onPress={() =>
            Share.share({
              message: `Je conduis ${currentRide?.riderName || 'un passager'}. Dest: ${currentRide?.dropoff}`,
            })
          }
        >
          <Ionicons name="share-social-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Carte fixe (ne défile pas avec la fiche) */}
      <View style={styles.mapContainer}>
        {(!mapReady || !mapVisible) && (
          <View style={{ ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', zIndex: 10 }}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={{ marginTop: 12, color: Colors.gray, fontFamily: Fonts.regular }}>Chargement de la carte...</Text>
          </View>
        )}
        {mapVisible && <Mapbox.MapView
          style={styles.map}
          styleURL="mapbox://styles/mapbox/streets-v12"
          logoEnabled={false}
          attributionEnabled={false}
          surfaceView={false}
          onDidFinishLoadingStyle={() => {
            setTimeout(() => setMapReady(true), 150);
          }}
          onDidFinishLoadingMap={() => {
            setTimeout(() => setMapReady(true), 150);
          }}
          onDidFailLoadingMap={() => {
            setMapReady(true);
          }}
        >
          <Mapbox.Camera
            ref={cameraRef}
            zoomLevel={14}
            // Ne pas envoyer de coordonnées tant que le GL thread n'est pas stable
            centerCoordinate={mapReady ? memoizedCenterCoordinate : undefined}
            animationMode="flyTo"
            animationDuration={1000}
          />

          <Mapbox.UserLocation />

          {currentRide.dropoffLat && (
            <Mapbox.PointAnnotation
              id="dropoff"
              coordinate={[Number(currentRide.dropoffLon!), Number(currentRide.dropoffLat!)]}
            >
              <View
                collapsable={false}
                style={[styles.markerContainer, { borderColor: Colors.secondary }]}
              >
                <View style={[styles.markerInner, { backgroundColor: Colors.secondary }]} />
              </View>
            </Mapbox.PointAnnotation>
          )}

          {routeCoords.length > 1 && (
            <Mapbox.ShapeSource id="routeSource" shape={routeSource}>
              <Mapbox.LineLayer
                id="routeLine"
                style={{
                  lineColor: Colors.primary,
                  lineWidth: 4,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </Mapbox.ShapeSource>
          )}
        </Mapbox.MapView>}

        <TouchableOpacity
          style={styles.floatingNav}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir la navigation vers la destination"
          onPress={() => openExternalNav(currentRide.dropoffLat!, currentRide.dropoffLon!)}
        >
          <Ionicons name="navigate" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.sheetContainer,
          {
            height: SHEET_HEIGHT,
            transform: [{ translateY: sheetY }],
          },
        ]}
        {...sheetPanResponder.panHandlers}
      >
        <View style={styles.sheetHandle} />
        <View style={styles.sheetScroll}>
          {/* Info Card Premium */}
          <View style={styles.infoCard}>
            <View style={[styles.riderCard, Shadows.sm]}>
              {riderPhotoUri ? (
                <Image source={{ uri: riderPhotoUri }} style={styles.riderAvatar} />
              ) : (
                <View style={styles.riderAvatarPlaceholder}>
                  <Ionicons name="person" size={26} color={Colors.primary} />
                </View>
              )}
              <View style={styles.riderTextCol}>
                <Text style={styles.riderLabel}>PASSAGER</Text>
                <Text style={styles.riderName} numberOfLines={1}>
                  {currentRide.riderName || 'Passager'}
                </Text>
                {currentRide.riderPhone ? (
                  <Text style={styles.riderPhone} numberOfLines={1}>
                    {currentRide.riderPhone}
                  </Text>
                ) : (
                  <Text style={styles.riderPhoneMuted}>Numéro non communiqué</Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.riderCallBtn, !currentRide.riderPhone && styles.riderCallBtnDisabled]}
                disabled={!currentRide.riderPhone}
                accessibilityRole="button"
                accessibilityLabel="Appeler le passager"
                onPress={() => {
                  if (currentRide.riderPhone) {
                    Linking.openURL(`tel:${currentRide.riderPhone.replace(/\s/g, '')}`);
                  }
                }}
              >
                <Ionicons name="call" size={20} color={Colors.white} />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>TEMPS ESTIMÉ</Text>
                <Text style={styles.statValue}>{eta ? `${eta} min` : 'Calcul...'}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>DISTANCE</Text>
                <Text style={styles.statValue}>{distance ? `${distance.toFixed(1)} km` : 'Calcul...'}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>PRIX ACTUEL</Text>
                <Text style={[styles.statValue, { color: '#10B981' }]}>
                  {(currentRide.fare || 0).toLocaleString('fr-FR')} F
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Stop Timer Section */}
            <View style={[styles.stopSection, currentRide.stop_started_at && styles.stopSectionActive]}>
              <View style={styles.stopTextContainer}>
                <Text style={styles.stopLabel}>TEMPS D'ARRÊT TOTAL</Text>
                <Text style={styles.stopValue}>
                  {Math.floor(((currentRide.total_stop_duration_s ?? 0) + (currentRide.stop_started_at ? liveStopSeconds : 0)) / 60)} min
                </Text>
                {currentRide.stop_started_at && (
                  <Text style={styles.liveTimerText}>
                    En cours: {formatDuration(liveStopSeconds)}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.stopActionBtn, currentRide.stop_started_at ? styles.resumeBtn : styles.pauseBtn]}
                onPress={() => currentRide.stop_started_at ? endStop() : startStop()}
              >
                <Ionicons name={currentRide.stop_started_at ? "play" : "pause"} size={22} color={Colors.white} />
                <Text style={styles.stopActionText}>
                  {currentRide.stop_started_at ? 'REPRENDRE' : 'ARRÊT'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* Route details */}
            <View style={styles.locationRow}>
              <View style={styles.dotLine}>
                <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
                <View style={styles.line} />
                <View style={[styles.dot, { backgroundColor: Colors.secondary }]} />
              </View>
              <View style={{ flex: 1, gap: 12 }}>
                <View>
                  <Text style={styles.locLabel}>DÉPART</Text>
                  <Text style={styles.locValue} numberOfLines={1}>{currentRide.pickup}</Text>
                </View>
                <View>
                  <Text style={styles.locLabel}>DESTINATION</Text>
                  <Text style={styles.locValue} numberOfLines={1}>{currentRide.dropoff}</Text>
                </View>
              </View>
            </View>

            {currentRide.service_type === 'livraison' && (
              <>
                <View style={styles.divider} />
                <View style={styles.deliveryInfoCard}>
                  <View style={styles.deliveryInfoHeader}>
                    <MaterialCommunityIcons name="package-variant" size={20} color={Colors.primary} />
                    <Text style={styles.deliveryInfoTitle}>DÉTAILS DU COLIS</Text>
                  </View>

                  <View style={styles.deliveryInfoRow}>
                    <View style={styles.deliveryInfoItem}>
                      <Text style={styles.deliveryInfoLabel}>Destinataire</Text>
                      <Text style={styles.deliveryInfoValue}>{currentRide.recipient_name || 'Non précisé'}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deliveryCallBtn}
                      onPress={() => {
                        if (currentRide.recipient_phone) {
                          Linking.openURL(`tel:${currentRide.recipient_phone}`);
                        } else {
                          Alert.alert('Info', 'Aucun numéro de téléphone pour le destinataire.');
                        }
                      }}
                    >
                      <Ionicons name="call" size={18} color={Colors.white} />
                    </TouchableOpacity>
                  </View>

                  {currentRide.package_description && (
                    <View style={styles.deliveryInfoItem}>
                      <Text style={styles.deliveryInfoLabel}>Description</Text>
                      <Text style={styles.deliveryInfoValue}>{currentRide.package_description}</Text>
                    </View>
                  )}

                  <View style={styles.deliveryInfoMeta}>
                    <View style={styles.deliveryMetaItem}>
                      <MaterialCommunityIcons name="weight-kilogram" size={16} color={Colors.gray} />
                      <Text style={styles.deliveryMetaText}>{currentRide.package_weight || 'Poids N/A'}</Text>
                    </View>
                    {currentRide.is_fragile && (
                      <View style={[styles.deliveryMetaItem, styles.fragileBadge]}>
                        <MaterialCommunityIcons name="alert-octagon" size={16} color="#B45309" />
                        <Text style={[styles.deliveryMetaText, { color: '#B45309' }]}>FRAGILE</Text>
                      </View>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </Animated.View>

      {/* Action bar fixe, indépendante du mouvement du sheet */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <TouchableOpacity
          style={[styles.primaryActionBtn, (!isOnline || loadingComplete) && styles.disabledBtn]}
          accessibilityRole="button"
          accessibilityLabel="Terminer la course"
          disabled={!isOnline || loadingComplete}
          onPress={async () => {
            setLoadingComplete(true);
            try {
              if (currentRide.stop_started_at) await endStop();

              // Sécurité : Calcul de la distance finale
              // On prend la plus grande valeur entre la distance calculée par le GPS (distance)
              // et la distance estimée initialement par le backend (currentRide.distance_m)
              // pour éviter les erreurs de facturation dues à un mauvais signal GPS à l'arrivée.
              const gpsDistanceM = distance ? Math.floor(distance * 1000) : 0;
              const estimatedDistanceM = currentRide.distance_m || 0;

              // Si la distance GPS est anormalement basse (< 100m) alors que l'estimé était significatif,
              // on privilégie l'estimé pour éviter le bug des 1000F.
              const finalDistanceM = (gpsDistanceM < 100 && estimatedDistanceM > 500)
                ? estimatedDistanceM
                : gpsDistanceM;

              const finalRide = await completeRide(finalDistanceM);
              if (finalRide) {
                router.replace({
                  pathname: '/ride/end',
                  params: {
                    fare: finalRide.fare,
                    rideId: finalRide.id,
                    // @ts-ignore
                    paymentLink: finalRide.paymentLink
                  }
                });
              } else {
                router.replace('/(tabs)');
              }
            } catch {
              Alert.alert('Erreur', 'Impossible de terminer la course.');
            } finally {
              setLoadingComplete(false);
            }
          }}
        >
          {loadingComplete ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.primaryActionText}>TERMINER LA COURSE</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    zIndex: 30,
  },
  sheetScroll: { flex: 1 },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    marginTop: 10,
    marginBottom: 8,
    zIndex: 2,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  phaseStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(54, 80, 208, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 8,
  },
  phaseStripText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.primary,
    letterSpacing: 0.2,
  },
  screenTitle: {
    fontSize: 19,
    fontFamily: Fonts.bold,
    color: Colors.black,
  },
  screenSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.gray,
    marginTop: 4,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.gray,
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4FB',
    justifyContent: 'center',
    alignItems: 'center',
  },

  mapContainer: {
    height: 320,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  map: { flex: 1 },
  floatingNav: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(26, 26, 26, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },

  markerContainer: {
    height: 24,
    width: 24,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  markerInner: {
    height: 10,
    width: 10,
    borderRadius: 5,
  },

  infoCard: {
    marginTop: 0,
    marginHorizontal: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 20,
    elevation: 0,
    shadowOpacity: 0,
  },

  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.lightGray,
    borderRadius: 18,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  riderAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.white,
  },
  riderAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  riderTextCol: {
    flex: 1,
    minWidth: 0,
  },
  riderLabel: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Colors.mediumGray,
    letterSpacing: 0.8,
  },
  riderName: {
    fontSize: 17,
    fontFamily: Fonts.bold,
    color: Colors.black,
    marginTop: 2,
  },
  riderPhone: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.gray,
    marginTop: 2,
  },
  riderPhoneMuted: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.mediumGray,
    marginTop: 2,
    fontStyle: 'italic',
  },
  riderCallBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  riderCallBtnDisabled: {
    backgroundColor: Colors.mediumGray,
    opacity: 0.6,
  },

  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.lightGray,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Colors.gray,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.black,
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.lightGray,
    marginVertical: 15,
  },

  stopSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
  },
  stopSectionActive: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  stopTextContainer: {
    flex: 1,
  },
  stopLabel: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Colors.gray,
  },
  stopValue: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: Colors.black,
  },
  liveTimerText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: '#D97706',
  },
  stopActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  pauseBtn: { backgroundColor: '#F59E0B' },
  resumeBtn: { backgroundColor: '#10B981' },
  stopActionText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: Fonts.bold,
  },

  locationRow: {
    flexDirection: 'row',
    gap: 15,
  },
  dotLine: {
    alignItems: 'center',
    paddingVertical: 5,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.lightGray,
    marginVertical: 4,
  },
  locLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Colors.gray,
    letterSpacing: 1,
  },
  locValue: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.black,
    marginTop: 2,
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
    zIndex: 80,
    elevation: 80,
  },
  primaryActionBtn: {
    backgroundColor: Colors.error, // Terminer est une action forte, souvent rouge ou noir
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  primaryActionText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
  },
  disabledBtn: {
    backgroundColor: Colors.gray,
    elevation: 0,
  },
  deliveryInfoCard: {
    marginTop: 10,
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  deliveryInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  deliveryInfoTitle: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Colors.gray,
    letterSpacing: 1,
  },
  deliveryInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  deliveryInfoItem: {
    marginBottom: 10,
  },
  deliveryInfoLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Colors.gray,
  },
  deliveryInfoValue: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.black,
    marginTop: 2,
  },
  deliveryCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deliveryInfoMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  deliveryMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  deliveryMetaText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.black,
  },
  fragileBadge: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
  },
});
