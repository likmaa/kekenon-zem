import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ensureAndroidNotificationChannels } from './notificationHandler';

type FcmData = Record<string, string | undefined> | null | undefined;

/**
 * Affiche une notification locale à partir d'un message FCM **data-only**.
 *
 * Indispensable côté chauffeur : l'auto-affichage Android est cassé sur ce build
 * (conflit expo-notifications ↔ @react-native-firebase/messaging) → on reprend la
 * main et on affiche nous-mêmes. Appelé par onMessage (premier plan) et
 * setBackgroundMessageHandler (arrière-plan / app fermée — process maintenu vivant
 * par le service GPS de premier plan quand le chauffeur est en ligne).
 *
 * Le serveur recopie title/body/android_channel/android_sound dans `data`
 * (voir FcmService::sendToTokens).
 */
export async function displayFcmDataMessage(data: FcmData): Promise<void> {
  if (!data || typeof data !== 'object') return;

  const title = data.title || 'TIC Driver';
  const body = data.body || '';
  const channelId = data.android_channel || 'tic_default';

  try {
    await ensureAndroidNotificationChannels();
  } catch {
    // canaux déjà créés / contexte headless : on continue.
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data as Record<string, unknown>,
        // Android : le son provient du canal. iOS : son explicite (fichier bundle).
        sound: Platform.OS === 'ios' ? (data.android_sound ? `${data.android_sound}.wav` : 'default') : undefined,
      },
      // Affichage immédiat sur le bon canal Android (ChannelAwareTrigger).
      trigger: Platform.OS === 'android' ? ({ channelId } as Notifications.ChannelAwareTriggerInput) : null,
    });
  } catch (e) {
    if (__DEV__) {
      console.warn('[FCM] Affichage notif locale échoué:', e);
    }
  }
}
