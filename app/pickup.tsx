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
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useDriverStore } from './providers/DriverProvider';
import * as Location from 'expo-location';
import { fetchRouteOSRM } from './utils/osrm';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Mapbox } from './utils/mapboxInit';
import { useMapVisible } from './hooks/useMapVisible';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { getImageUrl, withImageVersion } from './utils/images';
import { openExternalUrl, openNavigation } from './utils/openExternalUrl';
import {
  checkNetworkConnection,
  saveRideState,
  showNetworkErrorAlert,
  subscribeToNetworkChanges,
} from './utils/networkHandler';
import { DriverRideTopOverlay } from './components/ride/DriverRideTopOverlay';
import { DriverRideDetails } from './components/ride/DriverRideDetails';
import { SlideToConfirm } from './components/ride/SlideToConfirm';

// ─── ErrorBoundary ──────────────────────────────────────────────────────────
// Mapbox et certains composants natifs avalent les exceptions JSX et affichent
// un écran blanc sans aucun message d'erreur. Ce composant les intercepte et
// affiche un écran de reprise digne plutôt qu'un mur blanc inexpliqué.
type EBState = { hasError: boolean; message: string };
class PickupErrorBoundary extends React.Component<
  { children: React.ReactNode },
  EBState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: unknown): EBState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }
  componentDidCatch(error: unknown, info: unknown) {
    console.error('[PickupScreen] Render error caught by ErrorBoundary:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 32 }}>
          <Ionicons name="warning-outline" size={56} color="#EF4444" />
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16, textAlign: 'center' }}>
            Oops — écran de prise en charge
          </Text>
          <Text style={{ fontSize: 14, color: '#64748b', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            Une erreur inattendue s'est produite. Touchez « Réessayer » pour recharger.
          </Text>
          {__DEV__ && (
            <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, fontFamily: 'monospace', textAlign: 'center' }}>
              {this.state.message}
            </Text>
          )}
          <TouchableOpacity
            style={{ marginTop: 24, backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 }}
            onPress={() => this.setState({ hasError: false, message: '' })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Réessayer</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}


// ─── Système de logs de debug en temps réel ─────────────────────────────────
// Visible sur l'appareil physique sans ordinateur : taper 5 fois sur le badge ETA.
// Tous les logs sont aussi envoyés en console (adb logcat / Expo Dev Tools).
const MAX_LOGS = 40;
type LogEntry = { ts: string; tag: string; msg: string; isError?: boolean };

function usePickupDebug() {
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const log = React.useCallback((tag: string, msg: string, isError = false) => {
    const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.ms
    const line = `[PICKUP][${tag}] ${msg}`;
    if (isError) console.error(line); else console.log(line);
    setLogs(prev => [{ ts, tag, msg, isError }, ...prev].slice(0, MAX_LOGS));
  }, []);
  return { logs, log };
}

function DebugPanel({ logs, onClose }: { logs: LogEntry[]; onClose: () => void }) {
  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 9999, padding: 12,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: 13, fontWeight: '700' }}>
          🛠 PICKUP DEBUG PANEL
        </Text>
        <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
          <Text style={{ color: '#f87171', fontSize: 16, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: '#94a3b8', fontSize: 9, marginBottom: 6, fontFamily: 'monospace' }}>
        {logs.length} entrées · appuyer 5× sur ETA pour rouvrir
      </Text>
      {logs.map((entry, i) => (
        <View key={i} style={{ marginBottom: 3 }}>
          <Text style={{
            fontFamily: 'monospace',
            fontSize: 10,
            color: entry.isError ? '#f87171' : entry.tag === 'RENDER' ? '#fbbf24' : '#e2e8f0',
            lineHeight: 15,
          }}>
            <Text style={{ color: '#64748b' }}>{entry.ts} </Text>
            <Text style={{ color: entry.isError ? '#f87171' : '#818cf8' }}>[{entry.tag}] </Text>
            {entry.msg}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PickupScreenInner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    currentRide,
    setPickupDone,
    signalArrival,
    completeRide,
    startStop,
    endStop,
    navPref,
    syncCurrentRide,
  } = useDriverStore();
  const { logs, log } = usePickupDebug();
  const [debugVisible, setDebugVisible] = React.useState(false);
  const etaTapCount = React.useRef(0);
  const etaTapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Log de chaque render pour détecter les boucles de re-render (uniquement en console pour éviter les boucles infinies de state)
  const renderCount = React.useRef(0);
  renderCount.current += 1;
  React.useEffect(() => {
    console.log(`[PICKUP][RENDER] #${renderCount.current} — currentRide=${currentRide?.id ?? 'NULL'} status=${currentRide?.status ?? 'N/A'}`);
  });

  React.useEffect(() => {
    log('MOUNT', `Composant monté — rideId=${currentRide?.id ?? 'NULL'} pickupLat=${currentRide?.pickupLat} pickupLon=${currentRide?.pickupLon}`);
    return () => log('UNMOUNT', 'Composant démonté');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!currentRide) {
      const timer = setTimeout(() => {
        log('GUARD', 'currentRide=NULL (confirmé après délai de 500ms) → redirect /(tabs)', true);
        router.replace('/(tabs)');
      }, 500);
      return () => clearTimeout(timer);
    } else {
      log('GUARD', `currentRide OK → id=${currentRide.id} status=${currentRide.status}`);
    }
  }, [currentRide, router, log]);

  const isMounted = React.useRef(true);
  React.useEffect(() => () => { isMounted.current = false; }, []);

  const [eta, setEta] = React.useState(6);
  const [distance, setDistance] = React.useState<number | null>(null);
  const [myLoc, setMyLoc] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [routeCoords, setRouteCoords] = React.useState<{ latitude: number; longitude: number }[]>([]);
  const [loadingAction, setLoadingAction] = React.useState(false);
  const [deliveryCodeModalVisible, setDeliveryCodeModalVisible] = React.useState(false);
  const [deliveryCode, setDeliveryCode] = React.useState('');
  const [isOnline, setIsOnline] = React.useState(true);
  const [liveStopSeconds, setLiveStopSeconds] = React.useState(0);
  const [mapReady, setMapReady] = React.useState(false);
  const [mapFocusMode, setMapFocusMode] = React.useState<'overview' | 'origin' | 'destination'>('overview');
  const mapVisible = useMapVisible();
  const isOngoing = currentRide?.status === 'ongoing';
  const routeTargetLat = isOngoing ? currentRide?.dropoffLat : currentRide?.pickupLat;
  const routeTargetLon = isOngoing ? currentRide?.dropoffLon : currentRide?.pickupLon;
  const routeTargetKind = isOngoing ? 'dropoff' : 'pickup';

  // Filet de sécurité Mapbox : Forcer mapReady à true après 3 secondes quoi qu'il arrive (problème réseau ou native callback manqué)
  React.useEffect(() => {
    const safetyTimer = setTimeout(() => {
      if (!mapReady) {
        log('MAP', 'Sécurité : Force mapReady=true après timeout de 3s');
        setMapReady(true);
      }
    }, 3000);
    return () => clearTimeout(safetyTimer);
  }, [mapReady, log]);
  const [cameraBounds, setCameraBounds] = React.useState<{ ne: [number, number], sw: [number, number] } | null>(null);

  // Une clé primitive protège contre les boucles de rendu du Provider tout en
  // autorisant exactement un nouveau calcul lorsque la cible passe du pickup
  // à la destination. La MapView, elle, reste montée pendant cette transition.
  const routeLoadedRef = React.useRef<string | null>(null);
  const hasFittedRef = React.useRef(false);
  const activeRideRef = React.useRef(currentRide);
  const isOnlineRef = React.useRef(true);
  const cameraRef = React.useRef<Mapbox.Camera>(null);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setEta((e) => (e > 1 ? e - 1 : 1));
    }, isOngoing ? 60000 : 8000);
    return () => clearInterval(interval);
  }, [isOngoing]);

  // TIMING-01 : Délai de grâce avant le premier syncCurrentRide.
  //
  // POURQUOI : En production (latence réseau réelle au Bénin), syncCurrentRide()
  // peut recevoir une réponse 204 (pas de course active côté serveur) avant même
  // que fetchRouteOSRM() ait fini de charger. Cela appelait setCurrentRide(null),
  // déclenchant le useEffect de redirect vers /(tabs) pendant que la map était
  // encore en train de s'initialiser → crash silencieux → écran blanc.
  //
  // La garde isInitialMount empêche syncCurrentRide de tourner lors du
  // tout premier focus (i.e. quand l'écran s'ouvre juste après l'acceptation).
  // Il se lancera normalement si le chauffeur revient sur l'écran après
  // avoir navigué ailleurs (ex : appel téléphonique, notification, etc.).
  const isInitialMount = React.useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      if (isInitialMount.current) {
        log('SYNC', 'Premier focus — délai 3s avant syncCurrentRide');
        const timer = setTimeout(() => {
          isInitialMount.current = false;
          log('SYNC', 'syncCurrentRide() → start (après délai)');
          syncCurrentRide()
            .then(() => log('SYNC', 'syncCurrentRide() → done'))
            .catch((e) => log('SYNC', `syncCurrentRide() → ERROR: ${e}`, true));
        }, 3000);
        return () => clearTimeout(timer);
      }
      log('SYNC', 'Focus ultérieur → syncCurrentRide() immédiat');
      syncCurrentRide()
        .then(() => log('SYNC', 'syncCurrentRide() → done'))
        .catch((e) => log('SYNC', `syncCurrentRide() → ERROR: ${e}`, true));
    }, [syncCurrentRide, log])
  );

  React.useEffect(() => {
    activeRideRef.current = currentRide;
  }, [currentRide]);

  React.useEffect(() => {
    void checkNetworkConnection().then((state) => {
      if (!isMounted.current) return;
      isOnlineRef.current = state.isConnected;
      setIsOnline(state.isConnected);
    });

    return subscribeToNetworkChanges((state) => {
      const wasOnline = isOnlineRef.current;
      isOnlineRef.current = state.isConnected;
      if (isMounted.current) setIsOnline(state.isConnected);

      const ride = activeRideRef.current;
      if (!state.isConnected && wasOnline && ride?.status === 'ongoing') {
        void saveRideState(ride);
        showNetworkErrorAlert(true);
      } else if (state.isConnected && !wasOnline) {
        void syncCurrentRide();
      }
    });
  }, [syncCurrentRide]);

  React.useEffect(() => {
    if (!isOngoing || !currentRide) return;
    const interval = setInterval(() => {
      if (isOnlineRef.current) void syncCurrentRide();
      void saveRideState(activeRideRef.current);
    }, 30000);
    return () => clearInterval(interval);
  }, [isOngoing, currentRide?.id, syncCurrentRide]);

  React.useEffect(() => {
    if (!currentRide?.stop_started_at) {
      setLiveStopSeconds(0);
      return;
    }
    const start = new Date(currentRide.stop_started_at).getTime();
    const interval = setInterval(() => {
      setLiveStopSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentRide?.stop_started_at]);

  React.useEffect(() => {
    const targetLat = Number(routeTargetLat);
    const targetLon = Number(routeTargetLon);
    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) {
      setRouteCoords([]);
      setCameraBounds(null);
      log('OSRM', `Coordonnées ${routeTargetKind} invalides → itinéraire ignoré`, true);
      return;
    }

    const routeKey = `${routeTargetKind}:${targetLat}:${targetLon}`;
    if (routeLoadedRef.current === routeKey) return;
    routeLoadedRef.current = routeKey;
    hasFittedRef.current = false;
    setMapFocusMode('overview');
    setRouteCoords([]);
    setCameraBounds(null);
    if (isOngoing) {
      if (currentRide?.duration_s) setEta(Math.ceil(currentRide.duration_s / 60));
      if (currentRide?.distance_m) setDistance(currentRide.distance_m / 1000);
    }
    log('GPS', `Calcul de l'itinéraire vers ${routeTargetKind}`);

    (async () => {
      try {
        log('GPS', 'requestForegroundPermissionsAsync...');
        const { status } = await Location.requestForegroundPermissionsAsync();
        log('GPS', `permission → ${status}`);
        if (status !== 'granted') {
          log('GPS', 'Permission refusée → abandon', true);
          Alert.alert('Permission requise', "Activez la localisation pour continuer.");
          return;
        }

        log('GPS', 'getCurrentPositionAsync...');
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const position = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        log('GPS', `position → lat=${position.latitude.toFixed(5)} lon=${position.longitude.toFixed(5)}`);
        if (isMounted.current) setMyLoc(position);

        log('OSRM', `fetchRouteOSRM → ${routeTargetKind}(${targetLat.toFixed(4)},${targetLon.toFixed(4)})`);
        const coords = await fetchRouteOSRM(position, { latitude: targetLat, longitude: targetLon });
        if (!isMounted.current || routeLoadedRef.current !== routeKey) return;
        setRouteCoords(coords);

        if (isOngoing) {
          if (currentRide?.duration_s) setEta(Math.ceil(currentRide.duration_s / 60));
          if (coords.length > 1) {
            const distanceKm = coords.reduce((total, coord, index) => {
              if (index === 0) return 0;
              const previous = coords[index - 1];
              const dx = coord.longitude - previous.longitude;
              const dy = coord.latitude - previous.latitude;
              return total + Math.sqrt(dx * dx + dy * dy) * 111;
            }, 0);
            setDistance(distanceKm);
          } else if (currentRide?.distance_m) {
            setDistance(currentRide.distance_m / 1000);
          }
        }

        if (coords.length > 1) {
          const allLons = [...coords.map(c => c.longitude), position.longitude, targetLon];
          const allLats = [...coords.map(c => c.latitude), position.latitude, targetLat];
          const sw: [number, number] = [Math.min(...allLons), Math.min(...allLats)];
          const ne: [number, number] = [Math.max(...allLons), Math.max(...allLats)];
          setCameraBounds({ ne, sw });
        } else {
          log('MAP', `fitBounds ignoré — coords.length=${coords.length}`, true);
        }
      } catch (err) {
        log('GPS', `EXCEPTION: ${err}`, true);
        console.warn('Erreur chargement localisation ou route', err);
      }
    })();
  }, [
    routeTargetKind,
    routeTargetLat,
    routeTargetLon,
    isOngoing,
    currentRide?.duration_s,
    currentRide?.distance_m,
    log,
  ]);

  // Ces hooks doivent rester avant toute sortie conditionnelle. currentRide
  // devient null dès que completeRide termine, mais l'ordre des hooks doit
  // rester strictement identique pendant ce dernier rendu.
  const memoizedCenterCoordinate = React.useMemo(() => {
    const defaultLon = 2.39;
    const defaultLat = 6.37;
    const targetLon = Number(routeTargetLon);
    const targetLat = Number(routeTargetLat);
    const currentLon = Number(myLoc?.longitude);
    const currentLat = Number(myLoc?.latitude);

    const lon = Number.isFinite(targetLon)
      ? targetLon
      : (Number.isFinite(currentLon) ? currentLon : defaultLon);
    const lat = Number.isFinite(targetLat)
      ? targetLat
      : (Number.isFinite(currentLat) ? currentLat : defaultLat);
    return [lon, lat];
  }, [routeTargetLon, routeTargetLat, myLoc?.longitude, myLoc?.latitude]);

  React.useEffect(() => {
    log('MAP', `mapReady → ${mapReady}`);
    if (!mapReady || !cameraBounds || !cameraRef.current || hasFittedRef.current) return;
    hasFittedRef.current = true;

    const timer = setTimeout(() => {
      try {
        // Cadre l'itinéraire dans la fenêtre réellement libre entre le bandeau
        // supérieur et la fiche repliée + le CTA.
        const padding = [120, 60, 420, 60] as [number, number, number, number];
        cameraRef.current?.fitBounds(cameraBounds.ne, cameraBounds.sw, padding, 1000);
        log('MAP', 'fitBounds exécuté');
      } catch (err) {
        log('MAP', `fitBounds a échoué: ${err} → fallback setCamera`, true);
        try {
          cameraRef.current?.setCamera({
            centerCoordinate: [
              (cameraBounds.ne[0] + cameraBounds.sw[0]) / 2,
              (cameraBounds.ne[1] + cameraBounds.sw[1]) / 2,
            ],
            zoomLevel: 14,
            animationDuration: 1000,
          });
        } catch {
          log('MAP', 'Le fallback a aussi échoué', true);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mapReady, cameraBounds, log]);

  const handleEtaTap = React.useCallback(() => {
    etaTapCount.current += 1;
    if (etaTapTimer.current) clearTimeout(etaTapTimer.current);
    if (etaTapCount.current >= 5) {
      etaTapCount.current = 0;
      setDebugVisible(true);
    } else {
      etaTapTimer.current = setTimeout(() => { etaTapCount.current = 0; }, 1500);
    }
  }, []);

  const openExternalNav = (lat: number, lon: number) =>
    openNavigation(lat, lon, navPref === 'waze' ? 'waze' : 'gmaps');

  if (!currentRide) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#94a3b8" />
        <Text style={styles.emptyTitle}>Aucune course en cours</Text>
        <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.homeBtnText}>Retour au tableau de bord</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const pickupCoord = currentRide.pickupLat != null && currentRide.pickupLon != null
    ? { latitude: Number(currentRide.pickupLat), longitude: Number(currentRide.pickupLon) }
    : null;
  const dropoffCoord = currentRide.dropoffLat != null && currentRide.dropoffLon != null
    ? { latitude: Number(currentRide.dropoffLat), longitude: Number(currentRide.dropoffLon) }
    : null;
  const activeTargetCoord = isOngoing ? dropoffCoord : pickupCoord;
  const passengerName = currentRide.riderName ?? 'Passager';
  const passengerPhone = currentRide.riderPhone;
  const passengerPhoto = currentRide.riderPhoto;
  const passengerPhotoUri = passengerPhoto
    ? withImageVersion(getImageUrl(passengerPhoto), currentRide.id ?? passengerPhone ?? passengerName)
    : null;
  const sanitizedPassengerPhone = passengerPhone?.replace(/[^\d+]/g, '');
  const pickupAddress = currentRide.pickup ?? 'Point de prise en charge';
  const dropoffAddress = currentRide.dropoff ?? 'Destination inconnue';
  const fareDisplay = `${currentRide.fare.toLocaleString('fr-FR')} FCFA`;
  const pickupShort =
    pickupAddress.length > 42 ? `${pickupAddress.slice(0, 40)}…` : pickupAddress;
  const dropoffShort = currentRide.order_mode === 'duration'
    ? `Location horaire (${currentRide.duration_hours}h)`
    : (dropoffAddress.length > 42 ? `${dropoffAddress.slice(0, 40)}…` : dropoffAddress);
  const targetShort = isOngoing ? dropoffShort : pickupShort;

  const callPassenger = () => {
    if (!sanitizedPassengerPhone) return;
    Linking.openURL(`tel:${sanitizedPassengerPhone}`).catch(() =>
      Alert.alert('Erreur', "Impossible d'ouvrir l'application Téléphone.")
    );
  };

  const whatsappPassenger = () => {
    if (!sanitizedPassengerPhone) return;
    const digits = sanitizedPassengerPhone.replace(/[^\d]/g, '');
    if (!digits.length) return;
    const url = `https://wa.me/${digits}?text=${encodeURIComponent("Bonjour, je suis votre chauffeur.")}`;
    void openExternalUrl(url).then((ok) => {
      if (!ok) Alert.alert('Erreur', "Impossible d'ouvrir WhatsApp.");
    });
  };

  const routeSource = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: routeCoords.map(c => [c.longitude, c.latitude]),
    },
  } as any;

  const handleCompleteRide = async (confirmationCode?: string) => {
    setLoadingAction(true);
    try {
      if (currentRide.stop_started_at) await endStop();

      const gpsDistanceM = distance ? Math.floor(distance * 1000) : 0;
      const estimatedDistanceM = currentRide.distance_m || 0;
      const finalDistanceM = gpsDistanceM < 100 && estimatedDistanceM > 500
        ? estimatedDistanceM
        : gpsDistanceM;
      const finalRide = await completeRide(finalDistanceM, confirmationCode);

      if (finalRide) {
        setDeliveryCodeModalVisible(false);
        setDeliveryCode('');
        router.replace({
          pathname: '/ride/end',
          params: {
            fare: finalRide.fare,
            rideId: finalRide.id,
            // @ts-ignore paymentLink est ajouté par le backend à la fin de la course.
            paymentLink: finalRide.paymentLink,
          },
        });
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de terminer la course.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleFocusChange = () => {
    if (!cameraRef.current) return;
    try {
      if (mapFocusMode === 'overview' && myLoc) {
        setMapFocusMode('origin');
        cameraRef.current.setCamera({
          centerCoordinate: [myLoc.longitude, myLoc.latitude],
          zoomLevel: 16,
          animationDuration: 800,
          padding: { paddingBottom: 60, paddingTop: 0, paddingLeft: 0, paddingRight: 0 },
        });
        return;
      }

      if ((mapFocusMode === 'origin' || (mapFocusMode === 'overview' && !myLoc)) && activeTargetCoord) {
        setMapFocusMode('destination');
        cameraRef.current.setCamera({
          centerCoordinate: [activeTargetCoord.longitude, activeTargetCoord.latitude],
          zoomLevel: 16,
          animationDuration: 800,
          padding: { paddingBottom: 60, paddingTop: 0, paddingLeft: 0, paddingRight: 0 },
        });
        return;
      }

      setMapFocusMode('overview');
      if (cameraBounds) {
        cameraRef.current.setCamera({
          bounds: {
            ne: cameraBounds.ne,
            sw: cameraBounds.sw,
            paddingBottom: 420,
            paddingTop: 120,
            paddingLeft: 60,
            paddingRight: 60,
          },
          animationDuration: 800,
        });
      }
    } catch (error) {
      log('MAP', `Changement de focus impossible: ${error}`, true);
    }
  };

  const mapFocusIcon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] =
    mapFocusMode === 'overview'
      ? 'human-greeting'
      : mapFocusMode === 'origin'
        ? 'flag-checkered'
        : 'map-marker-distance';
  const mapFocusLabel =
    mapFocusMode === 'overview'
      ? 'Zoomer sur la position du chauffeur'
      : mapFocusMode === 'origin'
        ? 'Zoomer sur la destination'
        : "Afficher l'ensemble de l'itinéraire";

  return (
    <SafeAreaView style={styles.container}>
      {debugVisible && <DebugPanel logs={logs} onClose={() => setDebugVisible(false)} />}
      <DriverRideTopOverlay
        ride={currentRide}
        address={targetShort}
        eta={eta}
        isOnline={isOnline}
        onEtaPress={handleEtaTap}
      />

      {/* Carte fixe (ne doit pas bouger avec la fiche) */}
      <View style={styles.mapContainer}>
        {(!mapReady || !mapVisible) && (
          <View style={styles.mapLoader}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={{ fontSize: 18, fontFamily: Fonts.bold, marginTop: 12, color: Colors.white }}>{passengerName}</Text>
            <Text style={styles.mapLoaderText}>Chargement de l'itinéraire...</Text>
            <Text style={{ fontSize: 14, fontFamily: Fonts.regular, color: Colors.gray, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }}>{isOngoing ? dropoffAddress : pickupAddress}</Text>
          </View>
        )}
        {mapVisible && <Mapbox.MapView
          style={styles.map}
          styleURL="mapbox://styles/mapbox/streets-v12"
          logoEnabled={false}
          attributionEnabled={false}
          surfaceView={false}
          onDidFinishLoadingStyle={() => {
            log('MAP', 'Style chargé (onDidFinishLoadingStyle)');
            setTimeout(() => setMapReady(true), 150);
          }}
          onDidFinishLoadingMap={() => {
            log('MAP', 'Carte chargée complètement (onDidFinishLoadingMap)');
            setTimeout(() => setMapReady(true), 150);
          }}
          onDidFailLoadingMap={() => {
            log('MAP', 'Erreur de chargement native (onDidFailLoadingMap)', true);
            setMapReady(true);
          }}
        >
          <Mapbox.Camera
            ref={cameraRef}
            zoomLevel={14}
            // Ne pas envoyer de coordonnées tant que le GL thread n'est pas stable
            centerCoordinate={mapReady ? memoizedCenterCoordinate : undefined}
            animationMode="flyTo"
            animationDuration={2000}
          />

          <Mapbox.UserLocation />

          {mapReady && activeTargetCoord && (
            <>
              <Mapbox.PointAnnotation
                id="route-target"
                coordinate={[Number(activeTargetCoord.longitude), Number(activeTargetCoord.latitude)]}
              >
                <View
                  collapsable={false}
                  style={[styles.markerContainer, isOngoing && styles.dropoffMarkerContainer]}
                >
                  <View style={[styles.markerInner, isOngoing && styles.dropoffMarkerInner]} />
                </View>
              </Mapbox.PointAnnotation>

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
            </>
          )}
        </Mapbox.MapView>}

      </View>

      <View
        style={[
          styles.sheetContainer,
          {
            height: '40%',
            bottom: Math.max(insets.bottom, 12) + 78,
          },
        ]}
      >
        <View style={styles.sheetMapControls} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.externalMapButton}
            disabled={!activeTargetCoord}
            onPress={() => {
              if (activeTargetCoord) openExternalNav(activeTargetCoord.latitude, activeTargetCoord.longitude);
            }}
          >
            <Ionicons name="navigate" size={19} color={Colors.dark} />
            <Text style={styles.externalMapButtonText}>Maps</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.recenterButton}
            onPress={handleFocusChange}
            accessibilityRole="button"
            accessibilityLabel={mapFocusLabel}
          >
            <MaterialCommunityIcons name={mapFocusIcon} size={24} color={Colors.dark} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <DriverRideDetails
            ride={currentRide}
            passengerName={passengerName}
            passengerPhone={passengerPhone}
            passengerPhotoUri={passengerPhotoUri}
            pickupAddress={pickupAddress}
            dropoffAddress={dropoffAddress}
            fareDisplay={fareDisplay}
            eta={eta}
            distance={distance}
            liveStopSeconds={liveStopSeconds}
            onCall={callPassenger}
            onWhatsApp={whatsappPassenger}
            onStartStop={() => { void startStop(); }}
            onEndStop={() => { void endStop(); }}
            onCallRecipient={() => {
              if (currentRide.recipient_phone) {
                void Linking.openURL(`tel:${currentRide.recipient_phone.replace(/\s/g, '')}`);
              }
            }}
          />
        </ScrollView>
      </View>

      {/* Barre d'action fixe, indépendante du mouvement du sheet */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        {currentRide.status === 'pickup' ? (
          <TouchableOpacity
            style={[styles.primaryActionBtn, loadingAction && styles.disabledBtn]}
            disabled={loadingAction}
            onPress={async () => {
              setLoadingAction(true);
              try {
                await signalArrival();
              } catch {
                Alert.alert('Erreur', "Impossible de signaler votre arrivée.");
              } finally {
                setLoadingAction(false);
              }
            }}
          >
            {loadingAction ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
                <Text style={styles.primaryActionText}>
                  {currentRide.service_type === 'livraison' ? 'Je suis sur place' : 'Je suis arrivé'}
                </Text>
            )}
          </TouchableOpacity>
        ) : currentRide.status === 'arrived' ? (
          <SlideToConfirm
            label={currentRide.service_type === 'livraison'
              ? 'Glisser pour démarrer la livraison'
              : 'Glisser pour démarrer la course'}
            loading={loadingAction}
            disabled={loadingAction}
            onConfirm={async () => {
              setLoadingAction(true);
              try {
                await setPickupDone();
              } catch {
                Alert.alert('Erreur', 'Impossible de confirmer la prise en charge.');
              } finally {
                setLoadingAction(false);
              }
            }}
          />
        ) : currentRide.status === 'ongoing' ? (
          <SlideToConfirm
            label={currentRide.service_type === 'livraison'
              ? 'Glisser pour terminer la livraison'
              : 'Glisser pour terminer la course'}
            loading={loadingAction}
            disabled={!isOnline || loadingAction}
            onConfirm={() => {
              if (currentRide.service_type === 'livraison') {
                setDeliveryCodeModalVisible(true);
              } else {
                void handleCompleteRide();
              }
            }}
          />
        ) : (
          <TouchableOpacity
            style={[styles.primaryActionBtn, loadingAction && styles.disabledBtn]}
            disabled={loadingAction}
            onPress={async () => {
              setLoadingAction(true);
              try {
                await syncCurrentRide();
              } finally {
                setLoadingAction(false);
              }
            }}
          >
            {loadingAction ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryActionText}>Actualiser la course</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={deliveryCodeModalVisible} transparent animationType="fade" onRequestClose={() => setDeliveryCodeModalVisible(false)}>
        <View style={styles.codeModalBackdrop}>
          <View style={styles.codeModalCard}>
            <View style={styles.codeModalIcon}>
              <Ionicons name="shield-checkmark" size={26} color={Colors.dark} />
            </View>
            <Text style={styles.codeModalTitle}>Confirmer la remise</Text>
            <Text style={styles.codeModalHint}>Demandez au destinataire le code à 4 chiffres affiché sur l’application du client.</Text>
            <TextInput
              value={deliveryCode}
              onChangeText={(value) => setDeliveryCode(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
              placeholder="0000"
              placeholderTextColor="#94A3B8"
              style={styles.codeInput}
            />
            <View style={styles.codeModalActions}>
              <TouchableOpacity style={styles.codeCancelButton} onPress={() => setDeliveryCodeModalVisible(false)} disabled={loadingAction}>
                <Text style={styles.codeCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.codeConfirmButton, deliveryCode.length !== 4 && styles.disabledBtn]}
                disabled={deliveryCode.length !== 4 || loadingAction}
                onPress={() => void handleCompleteRide(deliveryCode)}
              >
                {loadingAction ? <ActivityIndicator size="small" color={Colors.dark} /> : <Text style={styles.codeConfirmText}>Valider</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Envelopper l'écran dans l'ErrorBoundary pour capturer les crashes JSX/Mapbox silencieux.
export default function PickupScreen() {
  return (
    <PickupErrorBoundary>
      <PickupScreenInner />
    </PickupErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 15, 15, 0.96)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'visible',
    zIndex: 30,
  },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { paddingTop: 14, paddingBottom: 16 },
  sheetMapControls: {
    position: 'absolute',
    top: -60,
    left: 16,
    right: 16,
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  externalMapButton: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 17,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.16)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  externalMapButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.dark,
  },
  recenterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.12)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },

  mapContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  mapLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#171717',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  mapLoaderText: {
    marginTop: 12,
    fontFamily: Fonts.semiBold,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  map: { flex: 1 },
  markerContainer: {
    height: 32,
    width: 32,
    backgroundColor: Colors.dark,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  markerInner: {
    height: 13,
    width: 13,
    backgroundColor: Colors.primary,
    borderRadius: 6,
  },
  dropoffMarkerContainer: {
    borderWidth: 2,
    borderColor: Colors.secondary,
  },
  dropoffMarkerInner: {
    backgroundColor: Colors.secondary,
  },

  emptyContainer: {
    flex: 1,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30
  },
  emptyTitle: {
    color: Colors.black,
    fontSize: 20,
    fontFamily: Fonts.bold,
    marginTop: 20,
    marginBottom: 30
  },
  homeBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16
  },
  homeBtnText: {
    color: Colors.white,
    fontFamily: Fonts.bold
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15,15,15,0.98)',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    zIndex: 80,
    elevation: 80,
  },
  primaryActionBtn: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  primaryActionText: {
    color: Colors.dark,
    fontSize: 16,
    fontFamily: Fonts.bold,
    letterSpacing: 0.1,
  },
  disabledBtn: {
    backgroundColor: Colors.gray,
    elevation: 0,
    shadowOpacity: 0,
  },
  codeModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  codeModalCard: { borderRadius: 24, backgroundColor: '#FFFFFF', padding: 22, alignItems: 'center' },
  codeModalIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  codeModalTitle: { marginTop: 14, fontFamily: Fonts.bold, fontSize: 20, color: Colors.dark },
  codeModalHint: { marginTop: 8, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 19, textAlign: 'center', color: '#64748B' },
  codeInput: {
    width: '100%',
    height: 62,
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    textAlign: 'center',
    fontFamily: Fonts.bold,
    fontSize: 28,
    letterSpacing: 12,
    color: Colors.dark,
  },
  codeModalActions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 18 },
  codeCancelButton: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E8F0' },
  codeCancelText: { fontFamily: Fonts.bold, fontSize: 14, color: '#475569' },
  codeConfirmButton: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  codeConfirmText: { fontFamily: Fonts.bold, fontSize: 14, color: Colors.dark },
});
