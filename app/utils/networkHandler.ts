import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { logger } from './logger';

const RIDE_STATE_KEY = '@active_ride_state';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 seconde

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
}

/**
 * Vérifie l'état de la connexion réseau
 */
export const checkNetworkConnection = async (): Promise<NetworkState> => {
  const state = await NetInfo.fetch();
  return {
    isConnected: state.isConnected ?? false,
    isInternetReachable: state.isInternetReachable,
    type: state.type,
  };
};

/**
 * Écoute les changements de connexion réseau
 */
export const subscribeToNetworkChanges = (
  callback: (state: NetworkState) => void
): (() => void) => {
  const unsubscribe = NetInfo.addEventListener((state) => {
    callback({
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    });
  });

  return unsubscribe;
};

/**
 * Sauvegarde l'état de la course localement
 */
export const saveRideState = async (rideData: any): Promise<void> => {
  try {
    await AsyncStorage.setItem(RIDE_STATE_KEY, JSON.stringify({
      ...rideData,
      savedAt: Date.now(),
    }));
  } catch (error) {
    logger.error('[NetworkHandler] Erreur lors de la sauvegarde:', error);
  }
};

/**
 * Récupère l'état de la course sauvegardé
 */
export const getSavedRideState = async (): Promise<any | null> => {
  try {
    const data = await AsyncStorage.getItem(RIDE_STATE_KEY);
    if (!data) return null;

    const parsed = JSON.parse(data);
    // Vérifier que la sauvegarde n'est pas trop ancienne (max 1 heure)
    const age = Date.now() - (parsed.savedAt || 0);
    if (age > 3600000) {
      await AsyncStorage.removeItem(RIDE_STATE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    logger.error('[NetworkHandler] Erreur lors de la récupération:', error);
    return null;
  }
};

/**
 * Supprime l'état de la course sauvegardé
 */
export const clearSavedRideState = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(RIDE_STATE_KEY);
  } catch (error) {
    logger.error('[NetworkHandler] Erreur lors de la suppression:', error);
  }
};

/**
 * Retry avec backoff exponentiel
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = INITIAL_RETRY_DELAY
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    // Si c'est une erreur réseau et qu'il reste des tentatives
    const isNetworkError =
      error?.message?.includes('Network request failed') ||
      error?.message?.includes('Failed to fetch') ||
      error?.name === 'TypeError';

    if (retries > 0 && isNetworkError) {
      // Vérifier la connexion avant de réessayer
      const networkState = await checkNetworkConnection();
      if (!networkState.isConnected) {
        throw new Error('Pas de connexion réseau disponible');
      }

      // Attendre avant de réessayer (backoff exponentiel)
      await new Promise(resolve => setTimeout(resolve, delay));

      // Réessayer avec un délai plus long
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }

    throw error;
  }
};

/**
 * Appel API avec retry automatique et gestion de la connexion
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  retries: number = MAX_RETRIES
): Promise<Response> => {
  // Vérifier la connexion avant de faire l'appel
  const networkState = await checkNetworkConnection();
  if (!networkState.isConnected) {
    throw new Error('Pas de connexion réseau disponible');
  }

  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('La requête a pris trop de temps');
        }
        throw error;
      }
    },
    retries,
    INITIAL_RETRY_DELAY
  );
};

/**
 * Affiche une alerte si la connexion est perdue pendant une course active
 */
export const showNetworkErrorAlert = (
  isDuringRide: boolean = false,
  onRetry?: () => void
): void => {
  const message = isDuringRide
    ? 'Connexion perdue. La course continue en mode hors ligne. Les données seront synchronisées dès que la connexion sera rétablie.'
    : 'Connexion réseau indisponible. Vérifiez votre connexion internet.';

  Alert.alert(
    'Problème de connexion',
    message,
    onRetry
      ? [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réessayer', onPress: onRetry },
      ]
      : [{ text: 'OK' }]
  );
};
