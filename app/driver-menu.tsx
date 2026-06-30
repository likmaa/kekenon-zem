import React, { useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Text, View, TouchableOpacity, TouchableWithoutFeedback, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS
} from 'react-native-reanimated';
import { Colors } from '../theme';
import { Fonts } from '../font';

const { width } = Dimensions.get('window');
const PANEL_WIDTH = width * 0.75;

export default function DriverMenuScreen() {
  const router = useRouter();
  const [devClickCount, setDevClickCount] = React.useState(0);

  const handleDevTrigger = () => {
    const newCount = devClickCount + 1;
    if (newCount >= 5) {
      setDevClickCount(0);
      router.push('/dev-panel' as any);
    } else {
      setDevClickCount(newCount);
    }
  };

  // Animation values
  const translateX = useSharedValue(-PANEL_WIDTH);
  const opacity = useSharedValue(0);

  // Opening animation
  useEffect(() => {
    translateX.value = withTiming(0, {
      duration: 300,
      easing: Easing.bezier(0.33, 1, 0.68, 1),
    });
    opacity.value = withTiming(1, {
      duration: 300,
    });
  }, []);

  const close = useCallback(() => {
    translateX.value = withTiming(-PANEL_WIDTH, {
      duration: 250,
      easing: Easing.in(Easing.quad),
    });
    opacity.value = withTiming(0, {
      duration: 250,
    }, (finished) => {
      if (finished) {
        runOnJS(router.back)();
      }
    });
  }, [router]);

  const handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove([
        'authToken',
        'driver_online',
        'driver_history',
        'driver_nav_pref'
      ]);
      router.replace('/' as any);
    } catch (e) {
      console.error("Erreur déconnexion:", e);
    }
  };

  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const MenuItem = ({ icon, label, route }: { icon: keyof typeof Ionicons.glyphMap; label: string; route: string }) => (
    <TouchableOpacity
      style={styles.menuItem}
      activeOpacity={0.7}
      onPress={() => {
        router.push(route as any);
      }}
    >
      <View style={styles.menuIconWrapper}>
        <Ionicons name={icon} size={22} color={Colors.primary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.gray} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.panel, animatedPanelStyle]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Menu</Text>
            <TouchableOpacity onPress={close} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.black} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <MenuItem icon="time-outline" label="Course en attente" route="/incoming" />
            <MenuItem icon="wallet-outline" label="Portefeuille" route="/wallet" />
            <MenuItem icon="stats-chart" label="Statistiques" route="/stats" />
            <MenuItem icon="person-outline" label="Profil" route="/profile" />

            <View style={styles.divider} />

            <TouchableOpacity
              style={[styles.menuItem, styles.logoutItem]}
              activeOpacity={0.7}
              onPress={handleLogout}
            >
              <View style={[styles.menuIconWrapper, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="log-out-outline" size={22} color="#EF4444" />
              </View>
              <Text style={[styles.menuLabel, { color: '#EF4444' }]}>Se déconnecter</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.footer}
            onPress={handleDevTrigger}
            activeOpacity={1}
          >
            <Text style={styles.versionText}>v1.0.3</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    backgroundColor: 'white',
    // borderTopRightRadius: 24,
    // borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 4, height: 0 },
    shadowRadius: 10,
    elevation: 8,
  },
  safeArea: {
    flex: 1,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50, // Increased further to clear notch
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  panelTitle: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 22,
    color: Colors.black,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  menuIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  menuLabel: {
    flex: 1,
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 16,
    color: Colors.black,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
    marginHorizontal: 8,
  },
  logoutItem: {
    marginTop: 'auto',
    marginBottom: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  versionText: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 12,
    color: Colors.gray,
  }
});
