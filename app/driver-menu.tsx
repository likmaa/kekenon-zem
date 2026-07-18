import React, { useCallback, useEffect } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { useDriverStore } from './providers/DriverProvider';
import { removeAuthToken } from './utils/authTokenStorage';

const { width } = Dimensions.get('window');
const PANEL_WIDTH = Math.min(width * 0.88, 370);

type MenuItemProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  onPress: () => void;
  color?: string;
  background?: string;
};

function MenuItem({
  icon,
  label,
  subtitle,
  onPress,
  color = Colors.dark,
  background = '#FFF2B5',
}: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} activeOpacity={0.75} onPress={onPress}>
      <View style={[styles.menuIconWrapper, { backgroundColor: background }]}>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#98938A" />
    </TouchableOpacity>
  );
}

export default function DriverMenuScreen() {
  const router = useRouter();
  const { currentRide, availableOffers, setOnline } = useDriverStore();
  const [devClickCount, setDevClickCount] = React.useState(0);

  const translateX = useSharedValue(-PANEL_WIDTH);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateX.value = withTiming(0, {
      duration: 300,
      easing: Easing.bezier(0.33, 1, 0.68, 1),
    });
    opacity.value = withTiming(1, { duration: 300 });
  }, [opacity, translateX]);

  const close = useCallback(() => {
    translateX.value = withTiming(-PANEL_WIDTH, {
      duration: 250,
      easing: Easing.in(Easing.quad),
    });
    opacity.value = withTiming(0, { duration: 250 }, finished => {
      if (finished) runOnJS(router.back)();
    });
  }, [opacity, router, translateX]);

  const navigate = useCallback((route: string) => {
    router.replace(route as never);
  }, [router]);

  const handleDevTrigger = () => {
    const newCount = devClickCount + 1;
    if (newCount >= 5) {
      setDevClickCount(0);
      navigate('/dev-panel');
    } else {
      setDevClickCount(newCount);
    }
  };

  const performLogout = async () => {
    try {
      await removeAuthToken();
      await AsyncStorage.multiRemove([
        'driver_online',
        'driver_history',
        'driver_nav_pref',
        'authUser',
      ]);
      setOnline(false);
      router.replace('/driver-phone-login');
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Se déconnecter',
      'Voulez-vous vraiment vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: () => void performLogout() },
      ],
    );
  };

  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const animatedBackdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const activeRide = currentRide && currentRide.status !== 'completed' && currentRide.status !== 'cancelled'
    ? currentRide
    : null;
  const rideRoute = activeRide
    ? (activeRide.status === 'arrived' || activeRide.status === 'ongoing' ? '/pickup' : '/incoming')
    : availableOffers.length > 0 ? '/(tabs)' : null;
  const rideTitle = activeRide
    ? 'Reprendre ma course'
    : availableOffers.length > 0
      ? `${availableOffers.length} course${availableOffers.length > 1 ? 's' : ''} en attente`
      : 'Aucune course active';
  const rideSubtitle = activeRide
    ? `${activeRide.pickup} → ${activeRide.dropoff}`
    : availableOffers.length > 0
      ? 'Consulter les nouvelles demandes'
      : 'Les nouvelles demandes apparaîtront ici';

  return (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.panel, animatedPanelStyle]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <LinearGradient
            colors={[Colors.primary, '#FFC928', Colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.panelHeader}
          >
            <Image
              source={require('../assets/images/logo_cabin.png')}
              style={styles.watermark}
              resizeMode="contain"
            />
            <View style={styles.headerTopRow}>
              <View>
                <Text style={styles.headerEyebrow}>Accès rapide</Text>
                <Text style={styles.panelTitle}>Raccourcis</Text>
              </View>
              <TouchableOpacity onPress={close} style={styles.closeButton} accessibilityLabel="Fermer le menu">
                <Ionicons name="close" size={22} color={Colors.dark} />
              </TouchableOpacity>
            </View>
            <Text style={styles.headerSubtitle}>Les actions utiles qui ne sont pas dans la navigation principale.</Text>
          </LinearGradient>

          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>Course</Text>
            <TouchableOpacity
              style={[styles.rideCard, !rideRoute && styles.rideCardDisabled]}
              activeOpacity={rideRoute ? 0.78 : 1}
              onPress={() => rideRoute && navigate(rideRoute)}
              disabled={!rideRoute}
            >
              <View style={styles.rideIconWrapper}>
                <Ionicons
                  name={activeRide ? 'navigate' : availableOffers.length > 0 ? 'time-outline' : 'checkmark-circle-outline'}
                  size={22}
                  color={rideRoute ? Colors.dark : '#8E897F'}
                />
              </View>
              <View style={styles.menuCopy}>
                <Text style={[styles.rideTitle, !rideRoute && styles.rideTextDisabled]}>{rideTitle}</Text>
                <Text style={styles.rideSubtitle} numberOfLines={2}>{rideSubtitle}</Text>
              </View>
              {rideRoute && <Ionicons name="arrow-forward" size={19} color={Colors.dark} />}
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Services</Text>
            <View style={styles.menuGroup}>
              <MenuItem
                icon="notifications-outline"
                label="Notifications"
                subtitle="Annonces et informations chauffeur"
                onPress={() => navigate('/notifications')}
              />
              <View style={styles.separator} />
              <MenuItem
                icon="time-outline"
                label="Historique des courses"
                subtitle="Retrouver vos activités passées"
                onPress={() => navigate('/historique')}
                background="#E5F6EB"
                color="#24914C"
              />
              <View style={styles.separator} />
              <MenuItem
                icon="add-circle-outline"
                label="Recharger le portefeuille"
                subtitle="Ajouter des fonds à votre solde"
                onPress={() => navigate('/wallet-topup')}
              />
              <View style={styles.separator} />
              <MenuItem
                icon="help-circle-outline"
                label="Aide et support"
                subtitle="Obtenir de l'aide rapidement"
                onPress={() => navigate('/help')}
                background="#EEF0EE"
                color="#5E655F"
              />
            </View>

            <TouchableOpacity style={styles.logoutButton} activeOpacity={0.75} onPress={handleLogout}>
              <View style={styles.logoutIcon}>
                <Ionicons name="log-out-outline" size={21} color={Colors.error} />
              </View>
              <Text style={styles.logoutText}>Se déconnecter</Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity style={styles.footer} onPress={handleDevTrigger} activeOpacity={1}>
            <Text style={styles.versionText}>v1.2.0 • Kêkênon Zem</Text>
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
    backgroundColor: 'rgba(15,15,15,0.56)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: PANEL_WIDTH,
    overflow: 'hidden',
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: '#F6F3E9',
    shadowColor: '#000000',
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
  safeArea: {
    flex: 1,
  },
  panelHeader: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 175,
    paddingHorizontal: 19,
    paddingTop: 18,
    paddingBottom: 23,
  },
  watermark: {
    position: 'absolute',
    width: 185,
    height: 185,
    right: -48,
    bottom: -66,
    opacity: 0.08,
    tintColor: Colors.dark,
    transform: [{ rotate: '-9deg' }],
  },
  headerTopRow: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerEyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: 'rgba(26,26,26,0.6)',
  },
  panelTitle: {
    marginTop: 1,
    fontFamily: Fonts.bold,
    fontSize: 27,
    color: Colors.dark,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  headerSubtitle: {
    zIndex: 2,
    maxWidth: 245,
    marginTop: 18,
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(26,26,26,0.66)',
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 17,
    paddingBottom: 8,
  },
  sectionTitle: {
    marginLeft: 5,
    marginBottom: 7,
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: '#706A60',
  },
  rideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 82,
    marginBottom: 18,
    padding: 13,
    borderRadius: 19,
    backgroundColor: Colors.primary,
  },
  rideCardDisabled: {
    borderWidth: 1,
    borderColor: '#E3DED2',
    backgroundColor: '#ECE9E1',
  },
  rideIconWrapper: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  rideTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.dark,
  },
  rideTextDisabled: {
    color: '#666158',
  },
  rideSubtitle: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: '#777166',
  },
  menuGroup: {
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6E1D5',
    backgroundColor: Colors.white,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 67,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  menuIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
  },
  menuLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.dark,
  },
  menuSubtitle: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: '#8A857B',
  },
  separator: {
    height: 1,
    marginLeft: 63,
    backgroundColor: '#EEEAE1',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    marginTop: 15,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3CBC7',
    backgroundColor: '#FFF8F7',
  },
  logoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#FCE9E6',
  },
  logoutText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.error,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  versionText: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: '#999388',
  },
});
