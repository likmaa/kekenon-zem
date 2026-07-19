import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Alert, Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { apiFetch, getApiBaseUrl } from '../utils/apiClient';
import { getAuthToken, removeAuthToken } from '../utils/authTokenStorage';
import { getPusherClient, unsubscribeChannel, getPusherConnectionState } from '../services/pusherClient';
import { logger } from '../utils/logger';

const LOCATION_TASK_NAME = 'background-location-task';

// Définition de la tâche en dehors du composant (obligatoire pour TaskManager)
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('[BackgroundLocation] Task error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const location = locations[0];
      const { latitude, longitude } = location.coords;

      try {
        const token = await getAuthToken();
        const savedRide = await AsyncStorage.getItem('current_ride_id');

        if (!token) return;

        const body: any = { lat: latitude, lng: longitude };
        if (savedRide) {
          body.ride_id = Number(savedRide);
        }

        await apiFetch('/driver/location', {
          method: 'POST',
          bearerToken: token,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
        });

        console.log('[BackgroundLocation] Update sent:', latitude, longitude);
      } catch (err) {
        console.warn('[BackgroundLocation] Failed to send update:', err);
      }
    }
  }
});

export type RideStatus = 'incoming' | 'pickup' | 'arrived' | 'ongoing' | 'completed' | 'cancelled';
export type Ride = {
  id: string;
  pickup: string;
  dropoff: string;
  fare: number;
  driverEarnings?: number; // Gain du zem, sans commission proportionnelle
  status: RideStatus;
  startedAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  createdAt?: number;
  pickupLat?: number;
  pickupLon?: number;
  dropoffLat?: number;
  dropoffLon?: number;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  riderPhoto?: string;
  duration_s?: number;
  distance_m?: number;
  vehicle_type?: 'standard' | 'vip';
  has_baggage?: boolean;
  service_type?: string;
  order_mode?: 'distance' | 'duration';
  duration_hours?: number;
  recipient_name?: string;
  recipient_phone?: string;
  package_description?: string;
  package_size?: 'small' | 'medium' | 'large';
  package_weight?: string;
  is_fragile?: boolean;
  /** Consigne passager (texte ou transcription vocale IA). */
  riderVoiceNote?: string;
  /** Fichier vocal original (chemin disque public Laravel). */
  riderVoiceAudioPath?: string;
  total_stop_duration_s?: number;
  stop_started_at?: string;
  arrived_at?: string;
  paymentMethod?: 'cash' | 'card' | 'm-money';
  pricing_mode?: 'fixed' | 'negotiable';
  negotiated_fare?: number;
  /** Négociation verbale : true si course fixe OU passager a confirmé le chauffeur.
   *  Contrôle l'activation de « Aller chercher mon client » sur l'écran détail. */
  negotiationConfirmed?: boolean;
};

const getRideActivityTimestamp = (ride: Ride): number =>
  ride.completedAt ?? ride.cancelledAt ?? ride.createdAt ?? ride.startedAt ?? 0;

const sortRidesMostRecentFirst = (rides: Ride[]): Ride[] =>
  rides.sort((a, b) => {
    const dateDifference = getRideActivityTimestamp(b) - getRideActivityTimestamp(a);
    if (dateDifference !== 0) return dateDifference;

    const aId = Number(a.id);
    const bId = Number(b.id);
    return Number.isFinite(aId) && Number.isFinite(bId) ? bId - aId : 0;
  });

/** Erreur d'acceptation quand la course a déjà été prise par un autre chauffeur. */
export class RideTakenError extends Error {
  constructor(message = 'Course récupérée par un autre chauffeur.') {
    super(message);
    this.name = 'RideTakenError';
  }
}

export type NavPref = 'auto' | 'waze' | 'gmaps';

export type DriverState = {
  online: boolean;
  currentRide: Ride | null;
  availableOffers: Ride[];
  history: Ride[];
  navPref: NavPref;
  lastLat: number | null;
  lastLng: number | null;
  setOnline: (v: boolean) => void;
  updateLocation: (lat: number, lng: number) => void;
  receiveRequest: (ride: Omit<Ride, 'status' | 'startedAt' | 'completedAt'>) => void;
  acceptRequest: (rideId?: string) => Promise<void>;
  declineRequest: (rideId?: string) => Promise<void>;
  signalArrival: () => Promise<void>;
  setPickupDone: () => Promise<void>;
  completeRide: (distance_m?: number, deliveryCode?: string) => Promise<Ride | null>;
  startStop: () => Promise<void>;
  endStop: () => Promise<void>;
  loadHistoryFromBackend: () => Promise<void>;
  setNavPref: (p: NavPref) => void;
  checkForIncomingOffer: () => Promise<void>;
  driverProfile: any | null;
  refreshProfile: () => Promise<void>;
  syncCurrentRide: () => Promise<void>;
  clearOffer: (rideId: string) => void;
};

const Ctx = createContext<DriverState | null>(null);

import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

export function DriverProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [online, setOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState<Ride | null>(null);
  const [availableOffers, setAvailableOffers] = useState<Ride[]>([]);
  const [history, setHistoryState] = useState<Ride[]>([]);

  // Centralized history updater with deduplication
  const setHistory = useCallback((updater: Ride[] | ((prev: Ride[]) => Ride[])) => {
    setHistoryState((prev) => {
      const newList = typeof updater === 'function' ? updater(prev) : updater;
      if (!Array.isArray(newList)) return prev;

      const deduplicated = newList.reduce((acc: Ride[], current: Ride) => {
        if (!current || !current.id) return acc;
        const currentId = String(current.id);
        const alreadyExists = acc.find(item => String(item.id) === currentId);
        if (!alreadyExists) {
          return [...acc, current];
        }
        // Update existing item if the new one has a terminal status
        const isTerminal = (s: string) => s === 'completed' || s === 'cancelled';
        return acc.map(item =>
          String(item.id) === currentId ? (isTerminal(current.status) ? current : item) : item
        );
      }, []);

      return sortRidesMostRecentFirst(deduplicated);
    });
  }, []);
  const [navPref, setNavPref] = useState<NavPref>('auto');
  const [driverProfile, setDriverProfile] = useState<any | null>(null);
  const [lastLat, setLastLat] = useState<number | null>(null);
  const [lastLng, setLastLng] = useState<number | null>(null);
  // CRASH-RECOVERY: empêche la persistance d'écraser le cache avant la réhydratation au montage
  const rideHydratedRef = useRef(false);
  // Miroir de currentRide lisible dans les callbacks sans les recréer (deps stables)
  const currentRideRef = useRef<Ride | null>(null);

  const clearCurrentRideState = useCallback(async () => {
    currentRideRef.current = null;
    setCurrentRide(null);
    try {
      await AsyncStorage.multiRemove(['current_ride_obj', 'current_ride_id']);
    } catch { }
  }, []);

  // Helper pour gérer les 401
  const handleUnauthorized = useCallback(async () => {
    try {
      await removeAuthToken();
      await AsyncStorage.removeItem('authUser');
      await clearCurrentRideState();
      setOnline(false);
      router.replace('/driver-onboarding');
    } catch { }
  }, [clearCurrentRideState, router]);

  const mapBackendRideStatus = useCallback((status?: string | null): RideStatus => {
    if (!status) return 'incoming';
    const s = status.trim().toLowerCase();

    // Exact English match (preferred)
    if (s === 'requested') return 'incoming';
    if (s === 'accepted') return 'pickup';
    if (s === 'arrived') return 'arrived';
    if (s === 'pickup') return 'pickup';
    if (s === 'started') return 'ongoing';
    if (s === 'ongoing') return 'ongoing';
    if (s === 'completed' || s === 'payed' || s === 'paid') return 'completed';
    if (s === 'cancelled') return 'cancelled';

    // French legacy fallback
    if (s === 'demandée') return 'incoming';
    if (s === 'acceptée') return 'pickup';
    if (s === 'arrivé' || s === 'arrivée') return 'arrived';
    if (s === 'en cours') return 'ongoing';
    if (s === 'terminée' || s === 'payé' || s === 'payée') return 'completed';
    if (s === 'annulée') return 'cancelled';

    return 'incoming';
  }, []);

  const mapApiRideToState = useCallback((payload: any): Ride | null => {
    if (!payload || !payload.id) return null;

    return {
      id: String(payload.id),
      pickup: payload.pickup_address ?? payload.pickup_label ?? 'Point de départ',
      dropoff: payload.dropoff_address ?? payload.dropoff_label ?? 'Destination',
      fare: Number(payload.fare_amount ?? payload.fare ?? 0),
      driverEarnings: payload.driver_earnings_amount != null ? Number(payload.driver_earnings_amount) : undefined,
      status: mapBackendRideStatus(payload.status),
      startedAt: payload.started_at ? new Date(payload.started_at).getTime() : undefined,
      completedAt: payload.completed_at ? new Date(payload.completed_at).getTime() : undefined,
      cancelledAt: payload.cancelled_at ? new Date(payload.cancelled_at).getTime() : undefined,
      createdAt: payload.created_at ? new Date(payload.created_at).getTime() : undefined,
      pickupLat: payload.pickup_lat != null ? Number(payload.pickup_lat) : undefined,
      pickupLon: payload.pickup_lng != null ? Number(payload.pickup_lng) : undefined,
      dropoffLat: payload.dropoff_lat != null ? Number(payload.dropoff_lat) : undefined,
      dropoffLon: payload.dropoff_lng != null ? Number(payload.dropoff_lng) : undefined,
      riderId: payload.rider_id ? String(payload.rider_id) : (payload.rider?.id ? String(payload.rider.id) : undefined),
      riderName: (payload.passenger_name || payload.passenger?.name || payload.rider?.name) ?? undefined,
      riderPhone: (payload.passenger_phone || payload.passenger?.phone || payload.rider?.phone) ?? undefined,
      riderPhoto: (payload.rider?.photo || payload.passenger?.photo) ?? undefined,
      duration_s: payload.duration_s != null ? Number(payload.duration_s) : (payload.eta_s != null ? Number(payload.eta_s) : undefined),
      distance_m: payload.distance_m != null ? Number(payload.distance_m) : undefined,
      vehicle_type: payload.vehicle_type,
      has_baggage: !!payload.has_baggage,
      service_type: payload.service_type,
      order_mode: payload.order_mode,
      duration_hours: payload.duration_hours != null ? Number(payload.duration_hours) : undefined,
      recipient_name: payload.recipient_name,
      recipient_phone: payload.recipient_phone,
      package_description: payload.package_description,
      package_size: payload.package_size,
      package_weight: payload.package_weight,
      is_fragile: !!payload.is_fragile,
      riderVoiceNote: typeof payload.rider_voice_note === 'string' ? payload.rider_voice_note : undefined,
      riderVoiceAudioPath:
        typeof payload.rider_voice_audio_path === 'string' ? payload.rider_voice_audio_path : undefined,
      total_stop_duration_s: payload.total_stop_duration_s != null ? Number(payload.total_stop_duration_s) : undefined,
      stop_started_at: payload.stop_started_at ?? undefined,
      paymentMethod: payload.payment_method ?? 'cash',
      pricing_mode: payload.pricing_mode,
      negotiated_fare: payload.negotiated_fare != null ? Number(payload.negotiated_fare) : undefined,
      // Course fixe : toujours confirmée. Négociable : true seulement après validation passager.
      negotiationConfirmed:
        typeof payload.negotiation_confirmed === 'boolean'
          ? payload.negotiation_confirmed
          : (payload.pricing_mode ?? 'fixed') !== 'negotiable' || payload.negotiation_confirmed_at != null,
    };
  }, [mapBackendRideStatus]);

  const startStop = useCallback(async () => {
    try {
      if (!getApiBaseUrl() || !currentRide) return;

      // Optimistic Update
      const stopTime = new Date().toISOString();
      setCurrentRide(prev => prev ? { ...prev, stop_started_at: stopTime } : null);

      const token = await getAuthToken();
      if (!token) return;

      const res = await apiFetch(`/driver/trips/${currentRide.id}/start-stop`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res) {
        setCurrentRide(prev => prev ? { ...prev, stop_started_at: undefined } : null);
        return;
      }
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        if (res.status === 422 && errorJson.message === 'Stop already started') {
          // If already started, we should sync our state instead of rolling back
          // We don't have the timestamp here, but we can keep it as is or refresh
          console.warn('Stop already started on server, keeping local state');
        } else {
          // Rollback on other errors
          setCurrentRide(prev => prev ? { ...prev, stop_started_at: undefined } : null);
          console.error('Failed to start stop on server:', errorJson.message);
        }
      } else {
        const json = await res.json();
        // Sync with server's exact timestamp
        setCurrentRide(prev => prev ? { ...prev, stop_started_at: json.stop_started_at } : null);
      }
    } catch (e) {
      console.error('Error starting stop:', e);
      setCurrentRide(prev => prev ? { ...prev, stop_started_at: undefined } : null);
    }
  }, [currentRide]);

  const endStop = useCallback(async () => {
    const rideSnapshot = currentRide;
    try {
      if (!getApiBaseUrl() || !rideSnapshot || !rideSnapshot.stop_started_at) return;

      // Optimistic Update
      const duration = Math.floor((Date.now() - new Date(rideSnapshot.stop_started_at).getTime()) / 1000);
      setCurrentRide(prev => prev ? {
        ...prev,
        stop_started_at: undefined,
        total_stop_duration_s: (prev.total_stop_duration_s || 0) + duration
      } : null);

      const token = await getAuthToken();
      if (!token) return;

      const res = await apiFetch(`/driver/trips/${rideSnapshot.id}/end-stop`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res) {
        setCurrentRide(rideSnapshot);
        return;
      }
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        if (res.status === 422 && errorJson.message === 'Invalid state') {
          // Likely already ended or status mismatch, we should refresh to sync
          console.warn('Stop ending failed (Invalid state), syncing with server');
        } else {
          // Rollback
          setCurrentRide(rideSnapshot);
          console.error('Failed to end stop on server:', errorJson.message);
        }
      } else {
        const json = await res.json();
        // Sync with exact server total
        setCurrentRide(prev => prev ? {
          ...prev,
          stop_started_at: undefined,
          total_stop_duration_s: json.total_stop_duration_s
        } : null);
      }
    } catch (e) {
      console.error('Error ending stop:', e);
      setCurrentRide(rideSnapshot);
    }
  }, [currentRide]);

  const refreshProfile = useCallback(async () => {
    try {
      if (!getApiBaseUrl()) return;
      const token = await getAuthToken();
      if (!token) return;

      const res = await apiFetch('/driver/profile', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res) return;

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const json = await res.json().catch(() => null);
      if (res.ok && json?.profile) {
        setDriverProfile(json.profile);
      }
    } catch (e) {
      console.error('Error refreshing profile:', e);
    }
  }, [handleUnauthorized]);

  const syncCurrentRide = useCallback(async () => {
    try {
      if (!getApiBaseUrl()) return;
      const token = await getAuthToken();
      if (!token) return;

      const res = await apiFetch('/driver/current-ride', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res) return;

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      console.log(`[DriverStore] syncCurrentRide: ${res.status}`);
      if (res.status === 204) {
        // Le serveur n'a plus de course active pour ce chauffeur.
        // Cas particulier « ongoing » : le chauffeur est en plein trajet. Pour ne pas
        // faire disparaître sa course sur un 204 transitoire (hoquet serveur), on
        // revérifie UNE fois avant de vider. Si la 2e réponse est encore 204, la course
        // est réellement terminée/annulée (y compris validation admin) → on vide.
        // Les autres statuts (incoming/pickup/arrived) sont vidés directement.
        const local = currentRideRef.current;
        if (local && local.status === 'ongoing') {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const recheck = await apiFetch('/driver/current-ride', {
              method: 'GET',
              headers: { Accept: 'application/json' },
            });
            if (recheck && recheck.status !== 204) {
              if (recheck.ok) {
                const j = await recheck.json().catch(() => null);
                const r2 = mapApiRideToState(j);
                if (r2) {
                  setCurrentRide(r2);
                  return;
                }
              }
              // Erreur réseau/serveur sur la revérification → on conserve la course locale
              return;
            }
            // 2e 204 confirmé → la course est bien terminée
          } catch {
            // La revérification a échoué (réseau) → on conserve la course locale
            return;
          }
        }
        await clearCurrentRideState();
        return;
      }

      if (!res.ok) {
        console.warn(`[DriverStore] syncCurrentRide failed: ${res.status}`);
        return;
      }

      const json = await res.json().catch(() => null);
      const ride = mapApiRideToState(json);
      if (!ride) {
        await clearCurrentRideState();
        return;
      }

      console.log(`[DriverStore] syncCurrentRide success: ${ride.id} (${ride.status})`);
      setCurrentRide(ride);
    } catch (e) {
      console.error('[DriverStore] syncCurrentRide error:', e);
    }
  }, [clearCurrentRideState, mapApiRideToState, handleUnauthorized]);

  const checkForIncomingOffer = useCallback(async () => {
    try {
      if (!getApiBaseUrl()) return;
      const token = await getAuthToken();
      if (!token) return;

      const res = await apiFetch('/driver/next-offer', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res) return;

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      if (!Array.isArray(json)) return;

      const rides = json.map(r => mapApiRideToState(r)).filter((r): r is Ride => !!r);

      setAvailableOffers(prev => {
        // Réconciliation avec le serveur : on garde les offres encore proposées
        // (référence conservée pour ne pas casser les timers) et on retire celles
        // qui ne le sont plus (acceptée, annulée, expirée) — sinon une offre
        // fantôme peut faire réapparaître le sheet en boucle.
        const serverIds = new Set(rides.map(r => r.id));
        const kept = prev.filter(p => serverIds.has(p.id));
        const keptIds = new Set(kept.map(k => k.id));
        const added = rides.filter(r => !keptIds.has(r.id));
        return [...kept, ...added];
      });
    } catch {
    }
  }, [mapApiRideToState, handleUnauthorized]);

  // Load persisted state on mount
  useEffect(() => {
    (async () => {
      try {
        // ONE-TIME RESET (v2): Clear corrupted history data
        const resetDone = await AsyncStorage.getItem('driver_history_reset_v2');
        if (!resetDone) {
          logger.info('Reset historique one-time v2');
          await AsyncStorage.removeItem('driver_history');
          await AsyncStorage.setItem('driver_history_reset_v2', '1');
        }

        const savedHistory = await AsyncStorage.getItem('driver_history');
        const savedNavPref = await AsyncStorage.getItem('driver_nav_pref');

        // CRASH-RECOVERY: réhydrater la course en cours depuis le cache local AVANT tout
        // appel réseau. Ainsi, après un crash, la course réapparaît instantanément même
        // hors-ligne. syncCurrentRide() réconciliera ensuite avec le serveur.
        try {
          const savedRideObj = await AsyncStorage.getItem('current_ride_obj');
          if (savedRideObj) {
            const parsedRide = JSON.parse(savedRideObj);
            const st = parsedRide?.status;
            if (parsedRide?.id && st && st !== 'completed' && st !== 'cancelled') {
              setCurrentRide(parsedRide);
              logger.info(`Course en cours réhydratée depuis le cache: ${parsedRide.id} (${st})`);
            } else {
              await AsyncStorage.removeItem('current_ride_obj');
            }
          }
        } catch { }
        // À partir d'ici, la persistance de currentRide est autorisée
        rideHydratedRef.current = true;

        // Sync online status from server (source of truth)
        try {
          const token = await getAuthToken();
          if (token && getApiBaseUrl()) {
            logger.info('Sync statut en ligne depuis le serveur...');
            const profileRes = await apiFetch('/driver/profile', {
              headers: { Accept: 'application/json' },
            });
            if (profileRes?.ok) {
              const profileJson = await profileRes.json();
              const serverOnline = profileJson?.user?.is_online ?? false;
              setOnline(serverOnline);
              await AsyncStorage.setItem('driver_online', serverOnline ? '1' : '0');
              logger.info(`Statut serveur: ${serverOnline ? 'EN LIGNE' : 'HORS LIGNE'}`);
            } else {
              logger.warn('Impossible de sync le statut serveur, fallback local', { status: profileRes?.status });
              const savedOnline = await AsyncStorage.getItem('driver_online');
              if (savedOnline != null) setOnline(savedOnline === '1');
            }
          } else {
            logger.warn('Pas de token ou URL API — fallback local');
            const savedOnline = await AsyncStorage.getItem('driver_online');
            if (savedOnline != null) setOnline(savedOnline === '1');
          }
        } catch (e) {
          logger.error('Erreur sync statut serveur', { error: String(e) });
          const savedOnline = await AsyncStorage.getItem('driver_online');
          if (savedOnline != null) setOnline(savedOnline === '1');
        }
        if (savedHistory) {
          const parsed = JSON.parse(savedHistory);
          if (Array.isArray(parsed)) {
            // Sanitize history: only keep terminal rides (completed + cancelled) and remove duplicates
            const sanitized = parsed
              .filter((r: any) => (r.status === 'completed' || r.status === 'cancelled') && r.id)
              .reduce((acc: any[], current: any) => {
                const currentId = String(current.id);
                const x = acc.find(item => String(item.id) === currentId);
                if (!x) return acc.concat([current]);
                else return acc;
              }, []);
            setHistory(sanitized);
          }
        }
        if (savedNavPref === 'waze' || savedNavPref === 'gmaps' || savedNavPref === 'auto') setNavPref(savedNavPref);
        await syncCurrentRide();
      } catch { }
    })();
    refreshProfile().catch(() => { });
  }, [refreshProfile, syncCurrentRide]);

  // Le cache sert uniquement à afficher rapidement une course après un crash.
  // Dès que l'app revient au premier plan, le serveur reprend la main et purge
  // immédiatement toute course locale qui n'est plus active.
  useEffect(() => {
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') void syncCurrentRide();
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void syncCurrentRide();
    }, 30000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [syncCurrentRide]);



  // Persist online and history
  useEffect(() => {
    (async () => {
      try { await AsyncStorage.setItem('driver_online', online ? '1' : '0'); } catch { }
    })();
  }, [online]);
  useEffect(() => {
    (async () => {
      try { await AsyncStorage.setItem('driver_history', JSON.stringify(history)); } catch { }
    })();
  }, [history]);
  useEffect(() => {
    (async () => {
      try { await AsyncStorage.setItem('driver_nav_pref', navPref); } catch { }
    })();
  }, [navPref]);

  // CRASH-RECOVERY: persister la course en cours pour la restaurer après un crash.
  // On ne persiste pas tant que la réhydratation initiale n'est pas faite (évite d'écraser
  // le cache avec le null initial). On efface le cache dès qu'une course est terminée/annulée.
  useEffect(() => {
    currentRideRef.current = currentRide;
    if (!rideHydratedRef.current) return;
    (async () => {
      try {
        if (currentRide && currentRide.status !== 'completed' && currentRide.status !== 'cancelled') {
          await AsyncStorage.setItem('current_ride_obj', JSON.stringify(currentRide));
        } else {
          await AsyncStorage.multiRemove(['current_ride_obj', 'current_ride_id']);
        }
      } catch { }
    })();
  }, [currentRide]);

  const updateLocation = useCallback((lat: number, lng: number) => {
    (async () => {
      try {
        if (!getApiBaseUrl()) return;
        const token = await getAuthToken();
        if (!token) return;

        const body: Record<string, number> = { lat, lng };
        if (currentRide?.id) {
          body.ride_id = Number(currentRide.id);
          // Persister l'ID de la course pour le TaskManager en arrière-plan
          await AsyncStorage.setItem('current_ride_id', String(currentRide.id));
        } else {
          await AsyncStorage.removeItem('current_ride_id');
        }

        await apiFetch('/driver/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
        });

        // Update local state for UI distance calculations
        setLastLat(lat);
        setLastLng(lng);
      } catch {
        // On ignore l'erreur réseau pour le moment
      }
    })();
  }, [currentRide?.id]);

  const toggleOnline = useCallback((nextOnline: boolean) => {
    (async () => {
      try {
        logger.info(`Toggle statut: ${nextOnline ? 'EN LIGNE' : 'HORS LIGNE'}`);

        const token = await getAuthToken();
        if (!token) return;

        if (!nextOnline) {
          setOnline(false);
          setAvailableOffers([]);
          setCurrentRide(prev => {
            if (prev && prev.status === 'incoming') return null;
            return prev;
          });

          const statusRes = await apiFetch('/driver/status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ online: false }),
          });

          if (!statusRes || !statusRes.ok) {
            if (statusRes?.status === 401) {
              handleUnauthorized();
              return;
            }
            setOnline(true);
            Alert.alert('Erreur', 'Impossible de mettre à jour le statut. (Erreur serveur)');
            return;
          }

          await AsyncStorage.setItem('driver_online', '0');
          return;
        }

        // Passage en ligne : sans lat/lng serveur, /driver/next-offer n’expose pas les courses avec adresse (rayon 10 km).
        const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
        if (permStatus !== 'granted') {
          Alert.alert(
            'Localisation requise',
            'Pour passer en ligne et recevoir des demandes à proximité, autorisez l’accès à la position (réglages > TIC > Position).'
          );
          return;
        }

        let lat: number | undefined;
        let lng: number | undefined;
        const lastPos = await Location.getLastKnownPositionAsync({ maxAge: 120000 });
        if (lastPos?.coords) {
          lat = lastPos.coords.latitude;
          lng = lastPos.coords.longitude;
        }
        if (lat == null || lng == null) {
          try {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
          } catch {
            Alert.alert(
              'GPS indisponible',
              'Impossible d’obtenir votre position. Activez le GPS ou sortez à l’air libre, puis réessayez.'
            );
            return;
          }
        }

        const locRes = await apiFetch('/driver/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ lat, lng }),
        });
        if (!locRes?.ok) {
          if (locRes?.status === 401) {
            handleUnauthorized();
            return;
          }
          Alert.alert(
            'Synchronisation',
            'Votre position n’a pas pu être envoyée au serveur. Vérifiez le réseau puis réessayez.'
          );
          return;
        }

        setLastLat(lat);
        setLastLng(lng);

        const statusRes = await apiFetch('/driver/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ online: true }),
        });

        if (!statusRes || !statusRes.ok) {
          if (statusRes?.status === 401) {
            handleUnauthorized();
            return;
          }
          Alert.alert('Erreur', 'Impossible de mettre à jour le statut. (Erreur serveur)');
          return;
        }

        setOnline(true);
        await AsyncStorage.setItem('driver_online', '1');

        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((pos) => {
            apiFetch('/driver/location', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            }).catch(() => { });
          })
          .catch(() => { });

        checkForIncomingOffer().catch(() => { });
      } catch (e) {
        setOnline(false);
        Alert.alert('Erreur', 'Impossible de se connecter au serveur. Vérifiez votre connexion.');
      }
    })();
  }, [handleUnauthorized, checkForIncomingOffer]);

  const clearOffer = useCallback((rideId: string) => {
    setAvailableOffers(prev => prev.filter(r => r.id !== rideId));
  }, []);

  const receiveRequest = useCallback((ride: Omit<Ride, 'status' | 'startedAt' | 'completedAt'>) => {
    setAvailableOffers((prev) => [ride as Ride, ...prev]);
  }, []);

  const acceptRequest = useCallback(async (rideId?: string) => {
    // If no rideId provided, use the first available offer if currentRide is null
    const targetId = rideId || (currentRide?.id);
    const rideSnapshot = availableOffers.find(r => r.id === targetId) || currentRide;

    if (!rideSnapshot || rideSnapshot.id !== targetId) {
      throw new Error('Aucune course à accepter');
    }

    const optimisticRide: Ride = {
      ...rideSnapshot,
      status: 'pickup',
      startedAt: rideSnapshot.startedAt ?? Date.now(),
    };

    const applyOptimistic = () => {
      setCurrentRide(optimisticRide);
      setAvailableOffers(prev => prev.filter(r => r.id !== targetId));
    };
    const rollback = () => {
      setCurrentRide(null);
      setAvailableOffers(prev => [rideSnapshot, ...prev]);
    };

    // Accepter une course EXIGE le serveur : sans API joignable, on ne simule
    // JAMAIS une acceptation (sinon le zem file en « aller chercher » alors que
    // la course reste 'requested' côté serveur → le client reste en recherche).
    if (!getApiBaseUrl()) {
      throw new Error('Serveur indisponible. Vérifiez votre connexion et réessayez.');
    }

    applyOptimistic();

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentification requise');
      }

      const res = await apiFetch(`/driver/trips/${targetId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!res || !res.ok) {
        // Course déjà prise par un plus rapide (422 RIDE_NOT_AVAILABLE) : on ne
        // remet PAS l'offre dans la liste — on la retire proprement et on signale
        // « course perdue » plutôt qu'une erreur technique.
        const body = res ? await res.json().catch(() => null) : null;
        const taken = res?.status === 422 || body?.code === 'RIDE_NOT_AVAILABLE';
        setCurrentRide(null);
        if (taken) {
          setAvailableOffers(prev => prev.filter(r => r.id !== targetId));
          throw new RideTakenError();
        }
        // Panne transitoire : on rétablit l'offre pour réessayer.
        setAvailableOffers(prev => (prev.some(r => r.id === targetId) ? prev : [rideSnapshot, ...prev]));
        throw new Error('Le serveur a refusé la confirmation');
      }

      // Succès : hydrater la course réelle (pricing_mode, negotiationConfirmed, etc.)
      const data = await res.json().catch(() => null);
      setCurrentRide(prev => {
        if (!prev || prev.id !== targetId) return prev;
        const isNegotiable = (data?.pricing_mode ?? rideSnapshot.pricing_mode) === 'negotiable';
        return {
          ...prev,
          pricing_mode: data?.pricing_mode ?? prev.pricing_mode,
          negotiationConfirmed: data?.negotiation_confirmed ?? !isNegotiable,
        };
      });
    } catch (error) {
      if (error instanceof RideTakenError) throw error;
      rollback();
      throw error;
    }
  }, [availableOffers, currentRide]);

  const declineRequest = useCallback(async (rideId?: string) => {
    const targetId = rideId || currentRide?.id;
    const rideSnapshot = availableOffers.find(r => r.id === targetId) || currentRide;

    if (!targetId || !rideSnapshot) return;

    // Optimistic: Remove from list
    setAvailableOffers(prev => prev.filter(r => r.id !== targetId));
    if (currentRide?.id === targetId) {
      setCurrentRide(null);
    }

    try {
      if (!getApiBaseUrl()) return;
      const token = await getAuthToken();
      if (!token) return;

      await apiFetch(`/driver/trips/${targetId}/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
    } catch {
      // ignore failure for now
    }
  }, [availableOffers, currentRide]);

  const signalArrival = useCallback(async () => {
    const rideSnapshot = currentRide;
    if (!rideSnapshot) return;

    const nowStr = new Date().toISOString();
    // Optimistic Update
    setCurrentRide((r) => r ? { ...r, status: 'arrived', arrived_at: nowStr } : r);

    try {
      if (!getApiBaseUrl()) return;
      const token = await getAuthToken();
      if (!token) {
        setCurrentRide(rideSnapshot);
        return;
      }

      const res = await apiFetch(`/driver/trips/${rideSnapshot.id}/arrived`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!res) {
        setCurrentRide(rideSnapshot);
        Alert.alert('Erreur réseau', 'Impossible de signaler votre arrivée.');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[DriverStore] signalArrival failed:', err);
        setCurrentRide(rideSnapshot); // Rollback
        Alert.alert('Erreur', err.message || 'Impossible de signaler votre arrivée sur le serveur.');
      }
    } catch (error) {
      console.error('[DriverStore] signalArrival error:', error);
      setCurrentRide(rideSnapshot); // Rollback
      Alert.alert('Erreur réseau', 'Impossible de signaler votre arrivée.');
    }
  }, [currentRide]);

  const setPickupDone = useCallback(async () => {
    const rideSnapshot = currentRide;
    if (!rideSnapshot) return;

    // Optimistic Update
    setCurrentRide((r) => r ? { ...r, status: 'ongoing' } : r);

    try {
      if (!getApiBaseUrl()) return;
      const token = await getAuthToken();
      if (!token) {
        setCurrentRide(rideSnapshot);
        return;
      }

      const res = await apiFetch(`/driver/trips/${rideSnapshot.id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!res) {
        setCurrentRide(rideSnapshot);
        Alert.alert('Erreur réseau', 'Impossible de contacter le serveur pour démarrer la course.');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[DriverStore] start trip failed:', err);
        setCurrentRide(rideSnapshot); // Rollback
        Alert.alert('Erreur', err.message || 'Impossible de démarrer la course sur le serveur.');
      }
    } catch (error) {
      console.error('[DriverStore] start trip error:', error);
      setCurrentRide(rideSnapshot); // Rollback
      Alert.alert('Erreur réseau', 'Impossible de contacter le serveur pour démarrer la course.');
    }
  }, [currentRide]);

  const completeRide = useCallback(async (distance_m?: number, deliveryCode?: string) => {
    const ride = currentRide;
    if (!ride) return null;

    const finalizeLocally = (serverRide?: any, completion?: any): Ride => {
      const mappedRide = serverRide ? mapApiRideToState(serverRide) : null;
      const finalRide: Ride = {
        ...ride,
        ...(mappedRide ?? {}),
        status: 'completed',
        completedAt: mappedRide?.completedAt ?? Date.now(),
      };
      const paymentLink = completion?.payment_link ?? serverRide?.payment_link;
      if (paymentLink) {
        (finalRide as Ride & { paymentLink?: string }).paymentLink = paymentLink;
      }
      if (completion?.earned !== undefined) {
        (finalRide as Ride & { earned?: number }).earned = Number(completion.earned);
      }

      setCurrentRide(null);
      setHistory((history) =>
        sortRidesMostRecentFirst([finalRide, ...history.filter((item) => item.id !== finalRide.id)]),
      );
      return finalRide;
    };

    try {
      if (!getApiBaseUrl()) return null;
      const token = await getAuthToken();
      if (!token) return null;
      const rideId = ride.id;
      if (!rideId) return null;

      // Pré-vol : le cache local peut être en retard après un retour d'arrière-plan.
      // On vérifie l'état serveur avant toute écriture financière de fin de course.
      const stateRes = await apiFetch(`/driver/rides/${rideId}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (stateRes?.status === 401) {
        handleUnauthorized();
        return null;
      }
      if (stateRes?.ok) {
        const serverRide = await stateRes.json().catch(() => null);
        const serverStatus = String(serverRide?.status ?? '').toLowerCase();
        if (serverStatus === 'completed') {
          return finalizeLocally(serverRide, serverRide);
        }
        if (!['ongoing', 'started'].includes(serverStatus)) {
          const syncedRide = mapApiRideToState(serverRide);
          if (syncedRide) setCurrentRide(syncedRide);
          Alert.alert(
            'Course non démarrée',
            "L'état de la course a été actualisé. Démarrez d'abord la course avant de la terminer.",
          );
          return null;
        }
      } else if (ride.status !== 'ongoing') {
        await syncCurrentRide();
        Alert.alert('Synchronisation', "Actualisation de l'état de la course nécessaire. Réessayez ensuite.");
        return null;
      }

      const res = await apiFetch(`/driver/trips/${rideId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          distance_m: distance_m,
          ...(deliveryCode ? { delivery_code: deliveryCode } : {}),
        })
      });

      if (res?.ok) {
        const json = await res.json();
        return finalizeLocally(json.ride, json);
      } else {
        const err = res ? await res.json().catch(() => ({})) : {};
        console.error('[DriverStore] complete trip failed:', err);
        if (res?.status === 422 && (err as { message?: string }).message === 'Invalid state') {
          await syncCurrentRide();
          Alert.alert(
            'Course actualisée',
            "L'état de cette course avait changé sur le serveur. Vérifiez l'action affichée puis réessayez.",
          );
        } else {
          Alert.alert('Erreur', (err as { message?: string }).message || 'Impossible de terminer la course sur le serveur.');
        }
        return null;
      }
    } catch (error) {
      console.error('[DriverStore] complete trip error:', error);
      Alert.alert('Erreur réseau', 'Impossible de terminer la course. Vérifiez votre connexion.');
      return null;
    }
  }, [currentRide, handleUnauthorized, mapApiRideToState, syncCurrentRide]);

  const loadHistoryFromBackend = useCallback(async () => {
    try {
      if (!getApiBaseUrl()) return;
      const token = await getAuthToken();
      if (!token) return;

      const [resCompleted, resCancelled] = await Promise.all([
        apiFetch('/driver/rides?status=completed&per_page=50', { headers: { Accept: 'application/json' } }),
        apiFetch('/driver/rides?status=cancelled&per_page=50', { headers: { Accept: 'application/json' } }),
      ]);

      const parseJson = async (res: Response | null): Promise<Ride[]> => {
        if (!res?.ok) return [];
        const json = await res.json().catch(() => null);
        if (!json || !Array.isArray(json.data)) return [];
        return json.data.reduce((acc: Ride[], item: any) => {
          const ride = mapApiRideToState(item);
          if (ride) acc.push({ ...ride, status: ride.status ?? item.status ?? 'completed' });
          return acc;
        }, []);
      };

      const [completed, cancelled] = await Promise.all([
        parseJson(resCompleted),
        parseJson(resCancelled),
      ]);

      const merged = [...completed, ...cancelled];
      if (merged.length === 0) return;

      // Merge with local history — deduplication handled by setHistory
      setHistory((prev) => [...prev, ...merged]);
    } catch {
      // Conserve l'historique local si l'appel échoue
    }
  }, [mapApiRideToState]);

  useEffect(() => {
    if (!online) return;

    let channel: any = null;
    let cancelled = false;

    (async () => {
      try {
        const client = await getPusherClient();
        channel = client.subscribe('presence-drivers');
        channel.bind('ride.requested', () => {
          if (!cancelled) {
            checkForIncomingOffer().catch(() => { });
          }
        });
        channel.bind('ride.cancelled', (data: { rideId: string | number }) => {
          if (!cancelled) {
            const rideIdStr = String(data.rideId);
            setAvailableOffers(prev => prev.filter(r => String(r.id) !== rideIdStr));
            setCurrentRide(prev => (prev && String(prev.id) === rideIdStr ? null : prev));
          }
        });
        // Course prise par un autre chauffeur : retrait instantané, zéro résidu.
        channel.bind('ride.taken', (data: { rideId: string | number; winnerDriverId: number }) => {
          if (cancelled) return;
          const rideIdStr = String(data.rideId);
          setAvailableOffers(prev => prev.filter(r => String(r.id) !== rideIdStr));
        });
      } catch (error) {
        console.warn('Realtime driver subscription failed', error);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeChannel(channel);
    };
  }, [online, checkForIncomingOffer]);

  // Canal personnel : assignation/réassignation manuelle par le support.
  // Indépendant du toggle "online" — une course retirée doit libérer l'écran même hors ligne.
  useEffect(() => {
    let channel: any = null;
    let cancelled = false;

    (async () => {
      try {
        const storedUser = await AsyncStorage.getItem('authUser');
        const myId = storedUser ? Number(JSON.parse(storedUser)?.id) : null;
        if (!myId || cancelled) return;

        const client = await getPusherClient();
        channel = client.subscribe(`private-driver.${myId}`);
        channel.bind('ride.reassigned', (payload: { rideId: string | number; new_driver_id: number; old_driver_id: number | null }) => {
          if (cancelled) return;
          const rideIdStr = String(payload.rideId);

          if (Number(payload.new_driver_id) === myId) {
            // Course assignée à moi : hydratation immédiate sans redémarrage
            syncCurrentRide().catch(() => { });
            Alert.alert(
              'Nouvelle course assignée',
              'Le support vous a assigné une course.',
              [
                { text: 'Plus tard', style: 'cancel' },
                { text: 'Voir la course', onPress: () => router.push('/pickup') },
              ],
            );
            return;
          }

          if (payload.old_driver_id != null && Number(payload.old_driver_id) === myId) {
            // Course retirée : libérer l'écran proprement au lieu de laisser un état orphelin
            setCurrentRide(prev => (prev && String(prev.id) === rideIdStr ? null : prev));
            setAvailableOffers(prev => prev.filter(r => String(r.id) !== rideIdStr));
            Alert.alert('Course réassignée', 'Cette course a été confiée à un autre chauffeur par le support.');
            router.replace('/(tabs)');
          }
        });

        channel.bind('bid.accepted', (payload: { rideId: string | number; fare: number }) => {
          if (cancelled) return;
          const rideIdStr = String(payload.rideId);
          // Hydrate the accepted ride details
          syncCurrentRide().catch(() => { });
          // Clear it from available offers
          setAvailableOffers(prev => prev.filter(r => String(r.id) !== rideIdStr));
          Alert.alert(
            'Offre acceptée !',
            `Félicitations, votre offre de ${payload.fare} FCFA a été acceptée par le passager.`,
            [
              { text: 'Démarrer', onPress: () => router.push('/pickup') },
            ],
          );
        });

        // Négociation verbale : le passager a confirmé (ou refusé) le chauffeur.
        channel.bind('ride.negotiation.confirmed', (payload: { rideId: string | number; confirmed: boolean; fare?: number }) => {
          if (cancelled) return;
          const rideIdStr = String(payload.rideId);
          if (payload.confirmed) {
            // Active « Aller chercher mon client » sur l'écran détail (mise à jour en place).
            setCurrentRide(prev => {
              if (!prev || String(prev.id) !== rideIdStr) return prev;
              return {
                ...prev,
                negotiationConfirmed: true,
                negotiated_fare: payload.fare ?? prev.negotiated_fare,
              };
            });
          } else {
            // Refus passager : la course repart dans le pool, on libère l'écran du chauffeur.
            setCurrentRide(prev => (prev && String(prev.id) === rideIdStr ? null : prev));
            setAvailableOffers(prev => prev.filter(r => String(r.id) !== rideIdStr));
            Alert.alert(
              'Course annulée',
              "Le client n'a pas confirmé la course. Elle a été remise à d'autres chauffeurs.",
            );
            router.replace('/(tabs)');
          }
        });

      } catch (error) {
        console.warn('Driver personal channel subscription failed', error);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeChannel(channel);
    };
  }, [syncCurrentRide]);

  // FCM : course annulée (passager / autre) — filet de sécurité si Pusher est en retard ou app au 1er plan.
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    const applyRideCancelled = (raw: unknown) => {
      const data = raw as Record<string, unknown> | undefined;
      if (!data) return;
      // 'ride_reassigned' : la course a été confiée à un autre chauffeur — même nettoyage qu'une annulation.
      if (data.type !== 'ride_cancelled' && data.type !== 'ride_reassigned') return;
      const rideId = data.ride_id != null ? String(data.ride_id) : null;
      setCurrentRide(prev => {
        if (!prev) return null;
        if (rideId && String(prev.id) !== rideId) return prev;
        return null;
      });
      if (rideId) {
        setAvailableOffers(prev => prev.filter(r => String(r.id) !== rideId));
      }
      router.replace('/(tabs)');
    };

    const applyRideAssigned = (raw: unknown) => {
      const data = raw as Record<string, unknown> | undefined;
      if (!data || data.type !== 'ride_assigned') return;
      // Course assignée par le support : hydratation immédiate (filet si Pusher est en retard)
      syncCurrentRide().catch(() => { });
    };

    const subResponse = Notifications.addNotificationResponseReceivedListener(response => {
      applyRideCancelled(response.notification.request.content.data);
      applyRideAssigned(response.notification.request.content.data);
    });
    const subReceived = Notifications.addNotificationReceivedListener(notification => {
      applyRideCancelled(notification.request.content.data);
      applyRideAssigned(notification.request.content.data);
    });

    return () => {
      subResponse.remove();
      subReceived.remove();
    };
  }, [router, syncCurrentRide]);

  // Suivi de la position du chauffeur lorsqu'il est en ligne
  useEffect(() => {
    if (!online) {
      if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
        Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
          .then(started => {
            if (started) Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
          })
          .catch(() => {});
      }
      return;
    }

    let foregroundSubscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    const startWatching = async () => {
      try {
        // Demande des permissions de premier plan
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
          console.warn('Location foreground permission denied');
          return;
        }

        if (!isMounted) return;

        // Suivi au premier plan (haute précision, intervalle court)
        foregroundSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 10,
          },
          (location) => {
            if (isMounted) {
              const { latitude, longitude } = location.coords;
              updateLocation(latitude, longitude);
            }
          }
        );

        // Arrière-plan (optionnel) : « Toujours » / « Toute la fois » — refus fréquent si l’utilisateur a choisi « pendant l’utilisation ».
        // Le watchPositionAsync ci-dessus suffit tant que l’app est au premier plan.
        if (Platform.OS === 'android' || Platform.OS === 'ios') {
          try {
            const existingBg = await Location.getBackgroundPermissionsAsync();
            let bgStatus = existingBg.status;
            if (bgStatus !== 'granted' && existingBg.canAskAgain) {
              const req = await Location.requestBackgroundPermissionsAsync();
              bgStatus = req.status;
            }
            if (bgStatus === 'granted') {
              const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
              if (!already) {
                await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                  accuracy: Location.Accuracy.Balanced,
                  timeInterval: 10000,
                  distanceInterval: 20,
                  foregroundService: {
                    notificationTitle: 'TIC Driver est actif',
                    notificationBody: 'Suivi de votre position pour les courses TIC',
                    notificationColor: '#FF7B00',
                  },
                  pausesUpdatesAutomatically: false,
                });
              }
              logger.info('[Location] Suivi position arrière-plan actif');
            } else {
              logger.info(
                '[Location] Position arrière-plan non accordée — envoi GPS uniquement quand l’app est ouverte (normal si « pendant l’utilisation »).'
              );
            }
          } catch (bgErr) {
            logger.warn('[Location] Démarrage arrière-plan impossible', { error: String(bgErr) });
          }
        }
      } catch (error) {
        console.warn('Error starting location watch:', error);
      }
    };

    startWatching();

    return () => {
      isMounted = false;
      if (foregroundSubscription) {
        foregroundSubscription.remove();
      }
      // On ne stoppe pas forcément ici si on veut que ça continue en arrière-plan,
      // mais si Online passe à false, le début du useEffect s'en charge.
    };
  }, [online, updateLocation]);

  // Polling périodique des offres si en ligne et pas de course
  useEffect(() => {
    if (!online || currentRide) return;

    const interval = setInterval(() => {
      const state = getPusherConnectionState();
      const isConnected = state === 'connected';

      // If connected via Pusher, we only need a slow fallback poll (e.g., 60s)
      // Otherwise, we poll faster (10s) to ensure ride reception
      const now = Date.now();
      const lastPoll = (window as any)._lastDriverPoll || 0;
      const elapsed = now - lastPoll;
      // Même si Pusher est « connected », les événements peuvent manquer (réseau, auth) : ne pas attendre 60 s.
      const threshold = isConnected ? 25000 : 10000;

      if (elapsed >= threshold) {
        (window as any)._lastDriverPoll = now;
        checkForIncomingOffer().catch(() => { });
        console.log(`[DriverStore] Adaptive poll triggered (State: ${state}, Threshold: ${threshold}ms)`);
      }
    }, 5000); // Check state every 5s

    return () => clearInterval(interval);
  }, [online, currentRide, checkForIncomingOffer]);

  const value = useMemo<DriverState>(() => ({
    online,
    currentRide,
    availableOffers,
    history,
    navPref,
    lastLat,
    lastLng,
    syncCurrentRide,
    clearOffer,
    setOnline: toggleOnline,
    updateLocation,
    setNavPref,
    checkForIncomingOffer,
    receiveRequest,
    acceptRequest,
    declineRequest,
    signalArrival,
    setPickupDone,
    completeRide,
    startStop,
    endStop,
    loadHistoryFromBackend,
    driverProfile,
    refreshProfile,
  }), [
    online,
    currentRide,
    availableOffers,
    history,
    navPref,
    lastLat,
    lastLng,
    syncCurrentRide,
    clearOffer,
    toggleOnline,
    updateLocation,
    checkForIncomingOffer,
    receiveRequest,
    acceptRequest,
    declineRequest,
    signalArrival,
    setPickupDone,
    completeRide,
    startStop,
    endStop,
    loadHistoryFromBackend,
    driverProfile,
    refreshProfile
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDriverStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDriverStore must be used within DriverProvider');
  return ctx;
}
