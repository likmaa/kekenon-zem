import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './apiClient';

const channelAudioAlert: Notifications.AudioAttributesInput = {
  usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
  contentType: Notifications.AndroidAudioContentType.SONIFICATION,
  flags: {
    enforceAudibility: true,
    requestHardwareAudioVideoSynchronization: false,
  },
};

/**
 * Même schéma que l’app passager + `FcmService::resolveNotificationPresentationMeta` (tic_ride, etc.).
 */
export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Notifications générales',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0008ff85',
    sound: null,
  });

  await Notifications.setNotificationChannelAsync('tic_ride', {
    name: 'Nouvelles courses',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 380, 200, 380],
    lightColor: '#FF231F7C',
    sound: 'ride.wav',
    audioAttributes: channelAudioAlert,
  });

  await Notifications.setNotificationChannelAsync('tic_wallet', {
    name: 'Portefeuille et paiements',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#1B5E20',
    sound: 'wallet.wav',
    audioAttributes: channelAudioAlert,
  });

  await Notifications.setNotificationChannelAsync('tic_promo', {
    name: 'Infos et promotions',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180, 100, 180],
    lightColor: '#6A1B9A',
    sound: 'promo.wav',
    audioAttributes: channelAudioAlert,
  });

  await Notifications.setNotificationChannelAsync('tic_default', {
    name: 'Autres alertes',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 160, 220],
    lightColor: '#0008ff85',
    sound: 'tic_default.wav',
    audioAttributes: channelAudioAlert,
  });
}

export async function registerForPushNotificationsAsync() {
  await ensureAndroidNotificationChannels();

  let token;

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    /**
     * iOS : `getDevicePushTokenAsync` = APNs (hex), rejeté par FCM HTTP v1.
     * `@react-native-firebase/messaging` fournit le jeton FCM sur iOS et Android.
     */
    if (Platform.OS === 'web') {
      return null;
    }
    try {
      const messaging = require('@react-native-firebase/messaging').default;
      token = await messaging().getToken();
    } catch (e) {
      if (__DEV__) {
        console.warn('[FCM] messaging().getToken() a échoué:', e);
      }
      if (Platform.OS === 'android') {
        token = (await Notifications.getDevicePushTokenAsync()).data;
      } else {
        token = null;
      }
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

/** Résultat enregistrement FCM (401 = session morte côté Sanctum). */
export type FcmRegisterResult =
  | { ok: true }
  | { ok: false; unauthorized: true }
  | { ok: false; status: number };

export async function registerTokenWithBackend(
  token: string,
  authToken: string,
): Promise<FcmRegisterResult> {
  try {
    const response = await apiFetch('/auth/fcm/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      bearerToken: authToken,
      body: JSON.stringify({
        token,
        device_type: Platform.OS,
      }),
    });
    if (!response) {
      return { ok: false, status: 0 };
    }

    if (response.ok) {
      await AsyncStorage.setItem('fcmToken', token);
      return { ok: true };
    }

    const status = response.status;
    if (status === 401) {
      if (__DEV__) {
        console.warn(
          '[FCM] Session invalide ou expirée (401) — enregistrement du jeton push ignoré. Reconnectez-vous.',
        );
      }
      return { ok: false, unauthorized: true };
    }

    const body = await response.text().catch(() => '');
    console.warn('[FCM] Enregistrement échoué', status, body);
    return { ok: false, status };
  } catch (error) {
    console.warn('[FCM] Erreur réseau enregistrement jeton:', error);
    return { ok: false, status: 0 };
  }
}
