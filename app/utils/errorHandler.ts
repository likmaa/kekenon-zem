import { Alert } from 'react-native';
import { logger } from './logger';

export type ErrorType = 'network' | 'auth' | 'server' | 'unknown';

export interface ApiError {
  message?: string;
  error?: string;
  status?: number;
}

/**
 * Extrait le message d'erreur d'une réponse API
 */
export const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const json = await response.json().catch(() => null);
    if (json) {
      return json.message || json.error || 'Une erreur est survenue';
    }
  } catch {
    // Ignorer les erreurs de parsing
  }

  // Messages par défaut selon le code de statut
  switch (response.status) {
    case 401:
      return 'Votre session a expiré. Veuillez vous reconnecter.';
    case 403:
      return 'Vous n\'avez pas les permissions nécessaires.';
    case 404:
      return 'Ressource introuvable.';
    case 500:
      return 'Erreur serveur. Veuillez réessayer plus tard.';
    case 503:
      return 'Service temporairement indisponible.';
    default:
      return 'Une erreur est survenue. Veuillez réessayer.';
  }
};

/**
 * Détermine le type d'erreur
 */
export const getErrorType = (error: any, response?: Response): ErrorType => {
  if (!response) {
    // Erreur réseau (pas de réponse)
    return 'network';
  }

  if (response.status === 401 || response.status === 403) {
    return 'auth';
  }

  if (response.status >= 500) {
    return 'server';
  }

  return 'unknown';
};

/**
 * Gère les erreurs de manière centralisée
 */
export const handleApiError = async (
  error: any,
  response?: Response,
  customMessage?: string,
  showAlert: boolean = true
): Promise<string> => {
  const errorType = getErrorType(error, response);
  let message = customMessage;

  if (!message && response) {
    message = await extractErrorMessage(response);
  } else if (!message) {
    // Erreur réseau
    if (error?.name === 'AbortError') {
      message = 'La requête a pris trop de temps. Vérifiez votre connexion internet.';
    } else if (error?.message?.includes('Network request failed') || error?.message?.includes('Failed to fetch')) {
      message = 'Impossible de se connecter au serveur. Vérifiez votre connexion internet.';
    } else {
      message = error?.message || 'Erreur de connexion. Vérifiez votre connexion internet et réessayez.';
    }
  }

  if (showAlert) {
    Alert.alert('Erreur', message);
  }

  // Report to developer panel if it's an important error
  if (errorType === 'server' || errorType === 'network') {
    logger.error(`[API Error] ${message}`, { status: response?.status, url: response?.url || 'unknown' });
  }

  return message || 'Une erreur inconnue est survenue';
};

/**
 * Wrapper pour les appels API avec gestion d'erreur automatique
 */
export const apiCall = async <T>(
  fetchPromise: Promise<Response>,
  options?: {
    onSuccess?: (data: T) => void;
    onError?: (error: string, type: ErrorType) => void;
    showAlert?: boolean;
  }
): Promise<T | null> => {
  const { onSuccess, onError, showAlert = true } = options || {};

  try {
    const response = await fetchPromise;

    if (!response.ok) {
      const errorType = getErrorType(null, response);
      const errorMessage = await extractErrorMessage(response);

      if (showAlert) {
        await handleApiError(null, response);
      }

      if (onError) {
        onError(errorMessage, errorType);
      }

      return null;
    }

    const data = await response.json().catch(() => null) as T;

    if (onSuccess && data) {
      onSuccess(data);
    }

    return data;
  } catch (error: any) {
    const errorMessage = error?.message || 'Erreur réseau. Veuillez réessayer.';
    const errorType: ErrorType = 'network';

    if (showAlert) {
      Alert.alert('Erreur', errorMessage);
    }

    if (onError) {
      onError(errorMessage, errorType);
    }

    return null;
  }
};

