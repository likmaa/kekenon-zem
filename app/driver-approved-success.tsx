import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients } from '../theme';
import { Fonts } from '../font';

export default function DriverApprovedSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const heroScale = useRef(new Animated.Value(0.82)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const contentShift = useRef(new Animated.Value(16)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(heroScale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(heroOpacity, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(contentShift, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [heroScale, heroOpacity, contentShift, contentOpacity]);

  const handleContinue = async () => {
    await AsyncStorage.setItem('hasSeenApprovalSuccess', 'true');
    router.replace('/driver-contract');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) - 8 }]}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Compte validé
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.heroWrap,
              {
                opacity: heroOpacity,
                transform: [{ scale: heroScale }],
              },
            ]}
          >
            <View style={styles.heroCircle}>
              <Ionicons name="checkmark" size={52} color={Colors.white} />
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="ribbon-outline" size={14} color="#37BD6B" />
              <Text style={styles.heroBadgeText}>Conducteur partenaire</Text>
            </View>
          </Animated.View>

          <Animated.View
            style={{
              opacity: contentOpacity,
              transform: [{ translateY: contentShift }],
            }}
          >
            <Text style={styles.lead}>Bienvenue dans l&apos;équipe</Text>
            <Text style={styles.leadSub}>
              Votre dossier a été accepté. Il ne reste plus qu&apos;à prendre connaissance du contrat conducteur et à le
              valider pour accéder au tableau de bord et recevoir des courses.
            </Text>

            <View style={styles.nextCard} accessibilityRole="summary">
              <Text style={styles.nextLabel}>Prochaine étape</Text>
              <View style={styles.nextRow}>
                <View style={styles.nextIcon}>
                  <Ionicons name="document-text-outline" size={24} color="#37BD6B" />
                </View>
                <View style={styles.nextBody}>
                  <Text style={styles.nextTitle}>Contrat conducteur</Text>
                  <Text style={styles.nextHint}>Lecture rapide puis signature pour activer votre accès.</Text>
                </View>
              </View>
            </View>

            <View style={styles.tipsGrid}>
              <View style={styles.tipChip}>
                <Ionicons name="navigate-outline" size={18} color="#37BD6B" />
                <Text style={styles.tipText}>Restez géolocalisé pour les offres</Text>
              </View>
              <View style={styles.tipChip}>
                <Ionicons name="notifications-outline" size={18} color="#37BD6B" />
                <Text style={styles.tipText}>Gardez les notifications activées</Text>
              </View>
            </View>
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.88}
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continuer vers le contrat conducteur"
          >
            <Text style={styles.primaryBtnText}>Lire et signer le contrat</Text>
            <Ionicons name="arrow-forward" size={22} color="#1A1A1A" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 8,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    color: Colors.black,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 28,
    flexGrow: 1,
  },
  heroWrap: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 22,
  },
  heroCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#37BD6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: 'rgba(55, 189, 107, 0.35)',
  },
  heroBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: '#047857',
    letterSpacing: 0.2,
  },
  lead: {
    fontFamily: Fonts.bold,
    fontSize: 26,
    color: Colors.black,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  leadSub: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
    paddingHorizontal: 2,
  },
  nextCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  nextLabel: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: Colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    marginBottom: 12,
    marginLeft: 2,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(55, 189, 107, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBody: {
    flex: 1,
  },
  nextTitle: {
    fontFamily: Fonts.bold,
    fontSize: 17,
    color: Colors.black,
    marginBottom: 4,
  },
  nextHint: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 18,
  },
  tipsGrid: {
    marginTop: 18,
    gap: 10,
  },
  tipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tipText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.black,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FDD835',
    paddingVertical: 16,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#FDD835',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: '#1A1A1A',
  },
});
