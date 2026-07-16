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
  Image,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useDriverStore } from './providers/DriverProvider';
import * as Location from 'expo-location';
import { fetchRouteOSRM } from './utils/osrm';
import { Ionicons } from '@expo/vector-icons';
import { Mapbox } from './utils/mapboxInit';
import { useMapVisible } from './hooks/useMapVisible';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { getImageUrl, withImageVersion } from './utils/images';
import { openExternalUrl, openNavigation } from './utils/openExternalUrl';

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


function WaitTimer({ arrivedAt }: { arrivedAt: string }) {
  const [seconds, setSeconds] = React.useState(0);

  React.useEffect(() => {
    const start = new Date(arrivedAt).getTime();
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [arrivedAt]);

  const grace = 5 * 60; // 5 min
  const isOverGrace = seconds > grace;
  const displaySeconds = isOverGrace ? seconds - grace : grace - seconds;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}:${rs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.timerCard, isOverGrace && styles.timerCardAlert]}>
      <Ionicons
        name={isOverGrace ? "warning" : "hourglass-outline"}
        size={24}
        color={isOverGrace ? Colors.error : Colors.primary}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.timerLabel}>
          {isOverGrace ? "Attente facturée" : "Délai de grâce"}
        </Text>
        <Text style={[styles.timerValue, isOverGrace && styles.timerValueAlert]}>
          {formatTime(displaySeconds)}
        </Text>
      </View>
      {isOverGrace && (
        <View style={styles.feeBadge}>
          <Text style={styles.feeText}>+{Math.floor(displaySeconds / 60) * 10} F</Text>
        </View>
      )}
    </View>
  );
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
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentRide, setPickupDone, signalArrival, navPref, syncCurrentRide } = useDriverStore();
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
  const [myLoc, setMyLoc] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [routeCoords, setRouteCoords] = React.useState<{ latitude: number; longitude: number }[]>([]);
  const [loadingAction, setLoadingAction] = React.useState(false);
  const [mapReady, setMapReady] = React.useState(false);
  const mapVisible = useMapVisible();

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

  // RENDER-LOOP-01 : Ce ref empêche le useEffect GPS/OSRM de se relancer en boucle.
  // Sans lui, chaque re-render du DriverProvider (polling Pusher, setCurrentRide, etc.)
  // recréait pickupLat/pickupLon comme nouvelles références, ce qui redéclenchait
  // l'effet → setMyLoc() → re-render → l'effet repart → boucle infinie → écran blanc.
  const routeLoadedRef = React.useRef(false);
  // Mémoriser les coordonnées de pickup pour les utiliser dans l'effet sans dépendance instable.
  const stablePickupLat = React.useRef<number | undefined>(undefined);
  const stablePickupLon = React.useRef<number | undefined>(undefined);
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

  React.useEffect(() => {
    const interval = setInterval(() => {
      setEta((e) => (e > 1 ? e - 1 : 1));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

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

  // Capturer les coordonnées de pickup à la première montée du composant seulement.
  // On utilise un ref (pas un state) pour éviter tout re-render supplémentaire.
  if (
    currentRide?.pickupLat != null &&
    currentRide?.pickupLon != null &&
    stablePickupLat.current === undefined
  ) {
    stablePickupLat.current = Number(currentRide.pickupLat);
    stablePickupLon.current = Number(currentRide.pickupLon);
  }

  React.useEffect(() => {
    if (routeLoadedRef.current) return;
    routeLoadedRef.current = true;
    log('GPS', 'Effect GPS/OSRM démarré');

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

        const pLat = stablePickupLat.current;
        const pLon = stablePickupLon.current;
        log('OSRM', `pickupRef → lat=${pLat} lon=${pLon} isFinite=${Number.isFinite(pLat as number) && Number.isFinite(pLon as number)}`);

        if (pLat != null && pLon != null && Number.isFinite(pLat) && Number.isFinite(pLon)) {
          log('OSRM', `fetchRouteOSRM start → from(${position.latitude.toFixed(4)},${position.longitude.toFixed(4)}) to(${pLat.toFixed(4)},${pLon.toFixed(4)})`);
          const coords = await fetchRouteOSRM(position, { latitude: pLat, longitude: pLon });
          log('OSRM', `fetchRouteOSRM done → ${coords.length} coords`);
          if (!isMounted.current) return;
          setRouteCoords(coords);

          if (coords.length > 1) {
            const allLons = [...coords.map(c => c.longitude), position.longitude, pLon];
            const allLats = [...coords.map(c => c.latitude), position.latitude, pLat];
            const sw: [number, number] = [Math.min(...allLons), Math.min(...allLats)];
            const ne: [number, number] = [Math.max(...allLons), Math.max(...allLats)];
            log('MAP', `Bounds calculés, attente de mapReady → sw=[${sw.map(v=>v.toFixed(4))}] ne=[${ne.map(v=>v.toFixed(4))}]`);
            setCameraBounds({ ne, sw });
          } else {
            log('MAP', `fitBounds ignoré — coords.length=${coords.length}`, coords.length <= 1);
          }
        } else {
          log('OSRM', 'Coordonnées de pickup invalides → OSRM ignoré', true);
        }
      } catch (err) {
        log('GPS', `EXCEPTION: ${err}`, true);
        console.warn('Erreur chargement localisation ou route', err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const pickupCoord = currentRide.pickupLat && currentRide.pickupLon
    ? { latitude: Number(currentRide.pickupLat), longitude: Number(currentRide.pickupLon) }
    : null;
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

  // PERF-OOM-01 : Mémoïser centerCoordinate pour éviter un rendu en boucle infini
  // de la caméra Mapbox (qui causait des plantages OutOfMemory sur Android/Xiaomi).
  // Sécurisé contre les valeurs NaN/invalides qui peuvent faire crasher la carte native (Écran blanc).
  const memoizedCenterCoordinate = React.useMemo(() => {
    const defaultLon = 2.39;
    const defaultLat = 6.37;
    const pLon = Number(pickupCoord?.longitude);
    const pLat = Number(pickupCoord?.latitude);
    const mLon = Number(myLoc?.longitude);
    const mLat = Number(myLoc?.latitude);

    const lon = Number.isFinite(pLon) ? pLon : (Number.isFinite(mLon) ? mLon : defaultLon);
    const lat = Number.isFinite(pLat) ? pLat : (Number.isFinite(mLat) ? mLat : defaultLat);
    return [lon, lat];
  }, [pickupCoord?.longitude, pickupCoord?.latitude, myLoc?.longitude, myLoc?.latitude]);

  // MAPBOX-STABILITY : 3 sécurités pour les téléphones Android agressifs (Xiaomi/MIUI)
  const hasFittedRef = React.useRef(false);

  React.useEffect(() => {
    log('MAP', `mapReady → ${mapReady}`);
    if (mapReady && cameraBounds && cameraRef.current) {
      // 1️⃣ Exécuter UNE seule fois
      if (hasFittedRef.current) return;
      hasFittedRef.current = true;

      log('MAP', 'Préparation de fitBounds (attente de stabilité GL)');
      // 2️⃣ Timeout de sécurité (le renderer Xiaomi dit souvent "ready" trop tôt)
      const timer = setTimeout(() => {
        try {
          const padding = [80, 60, 280, 60] as [number, number, number, number];
          cameraRef.current?.fitBounds(cameraBounds.ne, cameraBounds.sw, padding, 1000);
          log('MAP', 'fitBounds exécuté');
        } catch (err) {
          // 3️⃣ Fallback si fitBounds échoue au niveau bridge
          log('MAP', `fitBounds a échoué: ${err} → fallback setCamera`, true);
          try {
            cameraRef.current?.setCamera({
              centerCoordinate: [
                (cameraBounds.ne[0] + cameraBounds.sw[0]) / 2,
                (cameraBounds.ne[1] + cameraBounds.sw[1]) / 2
              ],
              zoomLevel: 14,
              animationDuration: 1000,
            });
          } catch (fallbackErr) {
            log('MAP', 'Le fallback a aussi échoué', true);
          }
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [mapReady, cameraBounds, log]);

  // Badge ETA : 5 taps pour ouvrir le panneau de debug
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

  return (
    <SafeAreaView style={styles.container}>
      {debugVisible && <DebugPanel logs={logs} onClose={() => setDebugVisible(false)} />}
      {/* Header premium harmonisé avec ride-ongoing */}
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={styles.phaseStrip}>
            <Ionicons name="navigate-circle" size={16} color={Colors.primary} />
            <Text style={styles.phaseStripText}>
              {currentRide.service_type === 'livraison' ? 'Navigation vers le colis' : 'Navigation vers le client'}
            </Text>
          </View>
          <Text style={styles.screenTitle}>
            {currentRide.service_type === 'livraison' ? 'Collecte du colis' : 'Prise en charge'}
          </Text>
          <Text style={styles.screenSubtitle} numberOfLines={2}>
            {pickupShort}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.statusText}>En approche</Text>
          </View>
        </View>
        {/* Badge ETA : taper 5× pour ouvrir le panneau de debug */}
        <TouchableOpacity style={styles.etaBadge} onPress={handleEtaTap} activeOpacity={0.7}>
          <Ionicons name="time" size={16} color={Colors.primary} />
          <Text style={styles.etaText}>{eta} min</Text>
        </TouchableOpacity>
      </View>

      {/* Carte fixe (ne doit pas bouger avec la fiche) */}
      <View style={styles.mapContainer}>
        {(!mapReady || !mapVisible) && (
          <View style={styles.mapLoader}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={{ fontSize: 18, fontFamily: Fonts.bold, marginTop: 12, color: Colors.black }}>{passengerName}</Text>
            <Text style={styles.mapLoaderText}>Chargement de l'itinéraire...</Text>
            <Text style={{ fontSize: 14, fontFamily: Fonts.regular, color: Colors.gray, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }}>{pickupAddress}</Text>
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

          {mapReady && pickupCoord && (
            <>
              <Mapbox.PointAnnotation
                id="pickup"
                coordinate={[Number(pickupCoord.longitude), Number(pickupCoord.latitude)]}
              >
                <View collapsable={false} style={styles.markerContainer}>
                  <View style={styles.markerInner} />
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

        {pickupCoord && (
          <TouchableOpacity
            style={styles.floatingNav}
            onPress={() => openExternalNav(pickupCoord.latitude, pickupCoord.longitude)}
          >
            <Ionicons name="navigate" size={24} color={Colors.white} />
          </TouchableOpacity>
        )}
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
          {/* Carte info passager épurée */}
          <View style={styles.infoCard}>
            {/* Passenger row */}
            <View style={styles.passengerHeader}>
              <View style={styles.avatarCircle}>
                {passengerPhotoUri ? (
                  <Image
                    source={{ uri: passengerPhotoUri }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Ionicons name="person" size={24} color={Colors.primary} />
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.passengerNameText} numberOfLines={1}>{passengerName}</Text>
                {passengerPhone ? (
                  <TouchableOpacity style={styles.ratingRow} onPress={callPassenger}>
                    <Ionicons name="call-outline" size={13} color={Colors.primary} />
                    <Text style={styles.ratingText} numberOfLines={1}>{passengerPhone}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Action buttons row */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.mapsBtn}
                onPress={() => pickupCoord && openExternalNav(pickupCoord.latitude, pickupCoord.longitude)}
              >
                <Ionicons name="navigate" size={18} color={Colors.white} />
                <Text style={styles.mapsBtnText}>MAPS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.roundIconBtn} onPress={callPassenger}>
                <Ionicons name="call" size={20} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.roundIconBtn} onPress={whatsappPassenger}>
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <View style={styles.locationRow}>
              <View style={styles.dotLine}>
                <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
                <View style={styles.line} />
                <View style={[styles.dot, { backgroundColor: Colors.secondary }]} />
              </View>
              <View style={{ flex: 1, gap: 12 }}>
                <View>
                  <Text style={styles.locLabel}>DÉPART</Text>
                  <Text style={styles.locValue} numberOfLines={1}>{pickupAddress}</Text>
                </View>
                <View>
                  <Text style={styles.locLabel}>DESTINATION</Text>
                  {currentRide.order_mode === 'duration' ? (
                    <Text style={styles.locValue} numberOfLines={1}>⏱ Location horaire ({currentRide.duration_hours}h)</Text>
                  ) : (
                    <Text style={styles.locValue} numberOfLines={1}>{dropoffAddress}</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.fareHighlight}>
              <Text style={styles.fareLabelSmall}>PRIX ESTIMÉ</Text>
              <Text style={styles.fareAmountLarge}>{fareDisplay}</Text>
            </View>

            {currentRide.status === 'arrived' && currentRide.arrived_at && (
              <WaitTimer arrivedAt={currentRide.arrived_at} />
            )}
          </View>
        </View>
      </Animated.View>

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
              <Text style={styles.primaryActionText}>JE SUIS ARRIVÉ</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.successActionBtn, loadingAction && styles.disabledBtn]}
            disabled={loadingAction}
            onPress={async () => {
              setLoadingAction(true);
              try {
                await setPickupDone();
                router.replace('/ride-ongoing');
              } catch {
                Alert.alert('Erreur', 'Impossible de confirmer la prise en charge.');
              } finally {
                setLoadingAction(false);
              }
            }}
          >
            {loadingAction ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryActionText}>PASSAGER À BORD</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
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
    marginTop: 4,
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
  etaBadge: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    gap: 6
  },
  etaText: {
    color: Colors.primary,
    fontSize: 14,
    fontFamily: Fonts.bold
  },

  mapContainer: {
    height: 380,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  mapLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  mapLoaderText: {
    marginTop: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.primary,
    fontSize: 14,
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
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  markerInner: {
    height: 12,
    width: 12,
    backgroundColor: Colors.primary,
    borderRadius: 6,
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
  passengerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4FB',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden' as const,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  passengerNameText: {
    color: Colors.black,
    fontSize: 17,
    fontFamily: Fonts.bold,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  ratingText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.gray,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  actionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  mapsBtnText: {
    color: Colors.white,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  roundIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: '#EEEEEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.lightGray,
    marginBottom: 20,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 20,
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
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.black,
    marginTop: 2,
  },

  fareHighlight: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 15,
    alignItems: 'center',
  },
  fareLabelSmall: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.gray,
    letterSpacing: 0.5,
  },
  fareAmountLarge: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: '#10B981',
    marginTop: 2,
  },

  timerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 16,
    marginTop: 15,
    gap: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  timerCardAlert: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  timerLabel: {
    color: Colors.gray,
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },
  timerValue: {
    color: Colors.black,
    fontSize: 18,
    fontFamily: Fonts.bold,
  },
  timerValueAlert: {
    color: Colors.error,
  },
  feeBadge: {
    backgroundColor: Colors.white,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  feeText: {
    color: Colors.error,
    fontFamily: Fonts.bold,
    fontSize: 13,
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
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
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
  successActionBtn: {
    backgroundColor: '#10B981',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
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
    shadowOpacity: 0,
  }
});
