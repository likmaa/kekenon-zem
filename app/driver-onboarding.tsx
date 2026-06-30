import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_H } = Dimensions.get('window');

const DRIVER_ONBOARDING_IMG = require('../assets/onboarding-tic-driver.png');

const ORANGE = Colors.secondary;

const SLIDES = [
  {
    key: 'pillar',
    lineWhite: 'Devenez le pilier',
    lineOrange: 'du développement urbain.',
    sub: 'de la ville de Porto-Novo.',
  },
  {
    key: 'platform',
    lineWhite: 'Des courses en direct,',
    lineOrange: 'vos gains sous contrôle.',
    sub: 'Activez la localisation pour recevoir les demandes à proximité et rejoindre le réseau.',
  },
] as const;

export default function DriverOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  const goNext = useCallback(() => {
    if (isLast) {
      router.push('/driver-location-permission');
    } else {
      setStep((s) => Math.min(s + 1, SLIDES.length - 1));
    }
  }, [isLast, router]);

  const skipAll = useCallback(() => {
    router.push('/driver-location-permission');
  }, [router]);

  const goBack = useCallback(() => {
    if (step > 0) {
      setStep((s) => Math.max(0, s - 1));
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [step, router]);

  const indicator = useMemo(() => `${String(step + 1).padStart(2, '0')} / ${String(SLIDES.length).padStart(2, '0')}`, [step]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Photo plein écran */}
      <Image
        source={DRIVER_ONBOARDING_IMG}
        style={styles.fullBleedImage}
        resizeMode="cover"
        accessibilityLabel="Chauffeur Kêkênon au volant d’un taxi"
      />

      {/* Assombrissement + renfort haut pour le texte */}
      <LinearGradient
        colors={['rgba(3,6,14,0.94)', 'rgba(3,6,14,0.58)', 'rgba(2,4,10,0.86)']}
        locations={[0, 0.38, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.content, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={goBack}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={26} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={skipAll} hitSlop={12} accessibilityRole="button" accessibilityLabel="Passer l’introduction">
            <Text style={styles.skip}>PASSER</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.topScroll}
          contentContainerStyle={styles.topScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.pageIndicator}>{indicator}</Text>
          <Text style={styles.headlineWhite}>{slide.lineWhite}</Text>
          <Text style={styles.headlineOrange}>{slide.lineOrange}</Text>
          <View style={styles.rule} />
          <Text style={styles.subtitle}>{slide.sub}</Text>
        </ScrollView>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerCtaLabel}>{isLast ? 'COMMENCER' : 'SUIVANT'}</Text>
          <View style={styles.progressTrack}>
            {SLIDES.map((s, i) => (
              <View key={s.key} style={[styles.progressSeg, i <= step && styles.progressSegActive]} />
            ))}
          </View>
        </View>
        <TouchableOpacity
          style={styles.fabNext}
          onPress={goNext}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Commencer' : 'Écran suivant'}
        >
          <Ionicons name="arrow-forward" size={22} color={Colors.black} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#03050c',
  },
  fullBleedImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    zIndex: 2,
    paddingBottom: 100,
  },
  topScroll: {
    flex: 1,
    maxHeight: SCREEN_H * 0.5,
  },
  topScrollContent: {
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  skip: {
    fontFamily: Fonts.titilliumWebSemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.2,
  },
  pageIndicator: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 14,
  },
  headlineWhite: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 34,
    lineHeight: 40,
    color: Colors.white,
    letterSpacing: -0.8,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  headlineOrange: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 34,
    lineHeight: 40,
    color: ORANGE,
    marginBottom: 16,
    letterSpacing: -0.8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  rule: {
    width: 44,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.95)',
    maxWidth: 340,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    zIndex: 3,
    paddingTop: 12,
    backgroundColor: 'rgba(2,4,12,0.5)',
  },
  footerLeft: {
    flex: 1,
    marginRight: 16,
  },
  footerCtaLabel: {
    fontFamily: Fonts.titilliumWebSemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 2,
    marginBottom: 10,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 8,
  },
  progressSeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    maxWidth: 120,
  },
  progressSegActive: {
    backgroundColor: Colors.white,
  },
  fabNext: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
    }),
  },
});
