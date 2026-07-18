import { isSentryEnabled } from './sentryInit';
import * as Sentry from '@sentry/react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ensureAndroidNotificationChannels,
  registerForPushNotificationsAsync,
  registerTokenWithBackend,
} from './utils/notificationHandler';

import { DriverProvider } from './providers/DriverProvider';
import { AppUpdateGate } from './components/AppUpdateGate';
import { getAuthToken, removeAuthToken } from './utils/authTokenStorage';
import { displayFcmDataMessage } from './utils/fcmDisplay';

// Configure notification handler for foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Handler FCM arrière-plan / app fermée : on affiche nous-mêmes (messages data-only
// côté serveur). Doit être enregistré au scope module, avant le rendu. Guardé par
// require pour ne pas crasher là où le module natif est absent (Expo Go).
try {
  const messaging = require('@react-native-firebase/messaging').default;
  messaging().setBackgroundMessageHandler(async (remoteMessage: { data?: Record<string, string> }) => {
    await displayFcmDataMessage(remoteMessage?.data);
  });
} catch (e) {
  if (__DEV__) {
    console.warn('[FCM] setBackgroundMessageHandler indisponible:', e);
  }
}

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Onboarding chauffeur en première étape
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
    'Rajdhani-Light':    require('../assets/fonts/Rajdhani-Light.ttf'),
    'Rajdhani-Regular':  require('../assets/fonts/Rajdhani-Regular.ttf'),
    'Rajdhani-Medium':   require('../assets/fonts/Rajdhani-Medium.ttf'),
    'Rajdhani-SemiBold': require('../assets/fonts/Rajdhani-SemiBold.ttf'),
    'Rajdhani-Bold':     require('../assets/fonts/Rajdhani-Bold.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

export default isSentryEnabled() ? Sentry.wrap(RootLayout) : RootLayout;

function RootLayoutNav() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    void ensureAndroidNotificationChannels();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

    const shouldForcePortrait = (
      pathname.startsWith('/driver-') ||
      pathname.startsWith('/pickup') ||
      pathname.startsWith('/ride-') ||
      pathname.startsWith('/incoming') ||
      pathname.startsWith('/ride/negotiation') ||
      pathname.startsWith('/complete') ||
      pathname.startsWith('/notifications')
    );


    (async () => {
      try {
        if (shouldForcePortrait) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } else {
          await ScreenOrientation.unlockAsync();
        }
      } catch {
        // Non bloquant: certains appareils peuvent ignorer le lock.
      }
    })();
  }, [pathname]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data.type === 'new_ride' && data.ride_id) {
        // Navigate to the incoming ride screen
        router.push({
          pathname: '/incoming',
          params: { ride_id: String(data.ride_id) }
        });
      }
    });

    return () => subscription.remove();
  }, []);

  // Auto re-register FCM token on app startup if user is authenticated
  useEffect(() => {
    const refreshFcmToken = async () => {
      try {
        const authToken = await getAuthToken();
        if (!authToken) return; // Not logged in, skip

        const fcmToken = await registerForPushNotificationsAsync();
        if (fcmToken) {
          const reg = await registerTokenWithBackend(fcmToken, authToken);
          if (reg.ok) {
            console.log('[FCM] Token enregistré au démarrage');
          } else if ('unauthorized' in reg && reg.unauthorized) {
            await removeAuthToken();
            await AsyncStorage.multiRemove(['authUser', 'hasSeenApprovalSuccess']);
            router.replace('/');
          }
        }
      } catch (err) {
        console.warn('[FCM] Auto-registration failed (non-blocking)', err);
      }
    };

    refreshFcmToken();
  }, []);

  // Premier plan : afficher nous-mêmes les messages FCM (data-only côté serveur).
  useEffect(() => {
    let unsubscribe: undefined | (() => void);
    try {
      const messaging = require('@react-native-firebase/messaging').default;
      unsubscribe = messaging().onMessage(async (remoteMessage: { data?: Record<string, string> }) => {
        await displayFcmDataMessage(remoteMessage?.data);
      });
    } catch (e) {
      if (__DEV__) {
        console.warn('[FCM] onMessage indisponible:', e);
      }
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <ThemeProvider value={DefaultTheme}>
      <AppUpdateGate app="driver" />
      <DriverProvider>
        <Stack
          screenOptions={{
            animation: 'slide_from_right',
            animationDuration: 260,
            gestureEnabled: true,
            fullScreenGestureEnabled: Platform.OS === 'ios',
            animationMatchesGesture: Platform.OS === 'ios',
          }}
        >
          {/* Onboarding / pré-flux */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="driver-onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="driver-location-permission" options={{ headerShown: false }} />
          <Stack.Screen name="driver-phone-login" options={{ headerShown: false }} />
          <Stack.Screen name="driver-login-otp" options={{ headerShown: false }} />
          <Stack.Screen name="driver-existing-account" options={{ headerShown: false }} />
          <Stack.Screen name="driver-existing-details" options={{ headerShown: false }} />
          <Stack.Screen name="become-driver" options={{ headerShown: false }} />
          <Stack.Screen name="driver-document-upload" options={{ headerShown: false }} />
          <Stack.Screen name="driver-pending-approval" options={{ headerShown: false }} />
          <Stack.Screen name="driver-approved-success" options={{ headerShown: false }} />
          <Stack.Screen name="driver-application-rejected" options={{ headerShown: false }} />
          <Stack.Screen name="driver-contract" options={{ headerShown: false }} />

          {/* App principale */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="driver-menu"
            options={{
              headerShown: false,
              presentation: 'transparentModal',
              animation: 'fade',
              animationDuration: 200,
            }}
          />
          <Stack.Screen
            name="modal"
            options={{ presentation: 'modal', animation: 'slide_from_bottom', animationDuration: 240 }}
          />
          <Stack.Screen
            name="incoming"
            options={{
              title: 'Demande entrante',
              presentation: 'modal',
              headerShown: false,
              animation: 'slide_from_bottom',
              animationDuration: 240,
            }}
          />
          <Stack.Screen
            name="pickup"
            options={{ title: 'Prise en charge', headerShown: false, animation: 'fade', animationDuration: 220 }}
          />
          <Stack.Screen
            name="ride-ongoing"
            options={{ title: 'Course en cours', headerShown: false, animation: 'fade', animationDuration: 220 }}
          />
          <Stack.Screen
            name="ride/end"
            options={{ title: 'Course terminée', headerShown: false, animation: 'fade_from_bottom', animationDuration: 240 }}
          />
          <Stack.Screen
            name="ride/negotiation"
            options={{ title: 'Négociation', headerShown: false, animation: 'fade_from_bottom', animationDuration: 240 }}
          />
          <Stack.Screen name="complete" options={{ title: 'Terminer' }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="wallet-topup" options={{ headerShown: false }} />
          <Stack.Screen name="wallet-history" options={{ headerShown: false }} />
          <Stack.Screen name="help" options={{ headerShown: false }} />
          <Stack.Screen name="dev-panel" options={{ headerShown: false }} />
        </Stack>
      </DriverProvider>
    </ThemeProvider>
  );
}
