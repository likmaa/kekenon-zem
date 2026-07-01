import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  Image,
  ActivityIndicator,
  Linking,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { setAuthToken } from './utils/authTokenStorage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { checkNetworkConnection } from './utils/networkHandler';
import { openExternalUrl } from './utils/openExternalUrl';

const LEGAL_CGU = 'https://kekenon.com/cgu';
const LEGAL_PRIVACY = 'https://kekenon.com/confidentialite';
const CONTENT_MAX = 420;
const DOCK_SPACE = 88;
const WA_DRIVER = '22997000000';

export default function DriverPhoneLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const phoneInputRef = useRef<TextInput>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/driver-onboarding');
  }, [router]);

  const formatPhoneNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = '';
    for (let i = 0; i < cleaned.length; i++) {
      if (i > 0 && i % 2 === 0) {
        formatted += ' ';
      }
      formatted += cleaned[i];
    }
    return formatted;
  };

  const handlePhoneChange = (text: string) => {
    const formattedText = formatPhoneNumber(text);
    if (formattedText.length <= 14) {
      setError(null);
      setPhone(formattedText);
    }
  };

  const isPhoneValid = [8, 10].includes(phone.replace(/\s/g, '').length);
  const hasError = Boolean(error);

  const sendOTP = async () => {
    if (loading) return;

    const cleanedPhone = phone.replace(/\s/g, '');
    if (cleanedPhone.length === 0) {
      setError('Entrez votre numéro (8 ou 10 chiffres, sans indicatif).');
      return;
    }
    if (!isPhoneValid) {
      setError('Le numéro doit contenir 8 ou 10 chiffres.');
      return;
    }

    setError(null);
    const e164 = `+229${cleanedPhone}`;

    if (!getApiBaseUrl()) {
      setError('URL API non configurée');
      return;
    }

    try {
      const net = await checkNetworkConnection();
      if (!net.isConnected) {
        setError('Pas de connexion Internet. Vérifiez le réseau puis réessayez.');
        return;
      }
      if (net.isInternetReachable === false) {
        setError('Connexion limitée. Réessayez dans un instant.');
        return;
      }
    } catch {
      setError('Impossible de vérifier le réseau. Réessayez.');
      return;
    }

    try {
      setLoading(true);
      const res = await apiFetch('/auth/request-otp', {
        method: 'POST',
        skipAuth: true,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ phone: e164, force_new: false }),
      });

      if (!res) {
        setError('Serveur injoignable.');
        return;
      }

      const json = await res.json().catch(() => null);

      if (!res.ok || !json) {
        if (res.status === 429) {
          setError('Trop de demandes. Patientez quelques minutes avant un nouvel envoi.');
        } else if (res.status >= 500) {
          setError('Service temporairement indisponible. Réessayez plus tard.');
        } else {
          setError((json?.message as string) || (json?.error as string) || 'Erreur serveur.');
        }
        return;
      }

      if (json.status === 'already_verified' && json.token) {
        try {
          await setAuthToken(json.token);
          if (json.user) {
            await AsyncStorage.setItem('authUser', JSON.stringify(json.user));
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          try {
            const profileRes = await apiFetch('/driver/profile', {
              method: 'GET',
              headers: { Accept: 'application/json' },
            });
            if (!profileRes || !profileRes.ok) {
              router.replace('/become-driver');
              return;
            }
            const profileJson = await profileRes.json().catch(() => null);
            if (!profileJson?.profile) {
              router.replace('/become-driver');
              return;
            }

            const status = profileJson.profile.status;
            const contractAcceptedAt = profileJson.profile.contract_accepted_at;
            const role = profileJson.role;
            const licenseNumber = profileJson.profile.license_number;

            if (status === 'pending' && !licenseNumber) router.replace('/become-driver');
            else if (status === 'pending') router.replace('/driver-pending-approval');
            else if (status === 'rejected') router.replace('/driver-application-rejected');
            else if (status === 'approved' && role === 'driver' && contractAcceptedAt) router.replace('/(tabs)' as any);
            else router.replace('/driver-contract');
          } catch {
            router.replace('/(tabs)' as any);
          }
          return;
        } catch {
          /* ignore */
        }
      }

      if (json.status !== 'otp_sent' && json.status !== 'otp_exists') {
        setError((json?.message as string) || "Impossible d'envoyer l'OTP.");
        return;
      }

      const otpKey = (json.otp_key ?? json.provider?.key) as string | undefined;
      if (!otpKey) {
        setError('Clé OTP manquante dans la réponse du serveur.');
        return;
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/driver-login-otp',
        params: { phone: cleanedPhone, otpKey },
      });
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.innerContainer}>
            
            {/* Header Back Button */}
            <View style={[styles.backRow, { top: Math.max(insets.top, 8) + 4 }]}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel="Retour"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollView}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: DOCK_SPACE + Math.max(insets.bottom, 12) },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.centerColumn}>
                
                {/* Brand stacked Logo */}
                <View style={styles.logoWrap}>
                  <Image
                    source={require('../assets/images/logo_cabin.png')}
                    style={styles.logoCabin}
                  />
                  <Image
                    source={require('../assets/images/logo_wheels.png')}
                    style={styles.logoWheels}
                  />
                  <Image
                    source={require('../assets/images/logo_text.png')}
                    style={styles.logoText}
                  />
                </View>

                {/* Title & subtitle */}
                <View style={styles.headerSection}>
                  <Text style={styles.title}>Connexion chauffeur</Text>
                  <Text style={styles.subtitle}>
                    Nous vous envoyons un code de validation par SMS.
                  </Text>
                </View>

                {/* Input Label */}
                <Text style={styles.inputLabel}>Numéro de téléphone</Text>

                {/* Phone Input Card */}
                <Pressable
                  onPress={() => phoneInputRef.current?.focus()}
                  style={[
                    styles.inputCard,
                    inputFocused && !hasError && styles.inputCardFocused,
                    hasError && styles.inputCardError,
                  ]}
                >
                  <View style={styles.prefixBlock}>
                    <View style={styles.inputFlagCircle}>
                      <Text style={styles.flagEmoji}>🇧🇯</Text>
                    </View>
                    <Text style={styles.countryCode}>+229</Text>
                  </View>
                  <TextInput
                    ref={phoneInputRef}
                    placeholder="01 97 23 45 67"
                    value={phone}
                    onChangeText={handlePhoneChange}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    keyboardType="number-pad"
                    style={styles.input}
                    placeholderTextColor="#9E9E9E"
                    maxLength={14}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (!loading) void sendOTP();
                    }}
                    accessibilityLabel="Numéro de téléphone"
                  />
                </Pressable>

                {/* Error Banner */}
                {error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={18} color={Colors.error} style={styles.errorIcon} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* Action Button */}
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={() => void sendOTP()}
                    disabled={loading}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel="Continuer"
                    accessibilityState={{ disabled: loading }}
                  >
                    {loading ? (
                      <View style={styles.buttonInner}>
                        <ActivityIndicator color="#1A1A1A" size="small" />
                        <Text style={[styles.buttonText, styles.buttonTextLoading]}>Envoi en cours…</Text>
                      </View>
                    ) : (
                      <Text style={styles.buttonText}>Continuer</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* CGU & Privacy */}
                <View style={styles.legalRow}>
                  <TouchableOpacity onPress={() => void openExternalUrl(LEGAL_CGU)} accessibilityRole="link">
                    <Text style={styles.legalLink}>Conditions d'Utilisation</Text>
                  </TouchableOpacity>
                  <Text style={styles.legalSep}>·</Text>
                  <TouchableOpacity onPress={() => void openExternalUrl(LEGAL_PRIVACY)} accessibilityRole="link">
                    <Text style={styles.legalLink}>Confidentialité</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </ScrollView>

            {/* Bottom Support Dock */}
            <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <View style={styles.bottomLinksInner}>
                <TouchableOpacity
                  style={styles.bottomLinkLeft}
                  onPress={() => router.replace('/driver-onboarding')}
                  accessibilityRole="button"
                  accessibilityLabel="Revoir l’introduction"
                >
                  <View style={styles.bottomLinkInnerLeft}>
                    <Ionicons name="play-outline" size={17} color="#212121" />
                    <Text style={styles.bottomLinkText} numberOfLines={2}>
                      Revoir l’introduction
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bottomLinkRight}
                  onPress={() =>
                    void Linking.openURL(
                      `https://wa.me/${WA_DRIVER}?text=${encodeURIComponent(
                        "Bonjour, j'ai besoin d'aide avec l'application chauffeur Kêkênon.",
                      )}`,
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Contacter le support sur WhatsApp"
                >
                  <View style={styles.bottomLinkInnerRight}>
                    <Text style={[styles.bottomLinkText, styles.bottomLinkTextRight]} numberOfLines={2}>
                      Besoin d’aide ?
                    </Text>
                    <Ionicons name="help-circle-outline" size={18} color="#212121" />
                  </View>
                </TouchableOpacity>
              </View>
            </View>

          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 56,
  },
  bottomDock: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  bottomLinksInner: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  backRow: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  centerColumn: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    alignItems: 'stretch',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCabin: {
    width: 130,
    height: 122,
    resizeMode: 'contain',
  },
  logoWheels: {
    width: 86,
    height: 29,
    resizeMode: 'contain',
    marginTop: 7,
    marginBottom: 25,
  },
  logoText: {
    width: 144,
    height: 27,
    resizeMode: 'contain',
  },
  headerSection: {
    marginBottom: 28,
    alignItems: 'center',
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    color: '#212121',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    color: '#9E9E9E',
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 360,
    alignSelf: 'center',
  },
  inputLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: '#212121',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 12,
    minHeight: 60,
  },
  inputCardFocused: {
    borderColor: Colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  inputCardError: {
    borderColor: Colors.error,
    backgroundColor: '#FEF2F2',
  },
  prefixBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  inputFlagCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  flagEmoji: {
    fontSize: 18,
  },
  countryCode: {
    fontSize: 17,
    fontFamily: Fonts.bold,
    color: '#212121',
    minWidth: 44,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontFamily: Fonts.regular,
    color: '#212121',
    letterSpacing: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  errorText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 14,
    fontFamily: Fonts.regular,
    lineHeight: 20,
  },
  footer: {
    marginTop: 28,
    width: '100%',
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 56,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOpacity: 0.15,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  buttonDisabled: {
    backgroundColor: '#BDBDBD',
    opacity: 0.7,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonText: {
    color: '#1A1A1A',
    fontFamily: Fonts.bold,
    fontSize: 17,
  },
  buttonTextLoading: {
    marginLeft: 4,
    color: '#1A1A1A',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    flexWrap: 'wrap',
  },
  legalLink: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: '#757575',
    textDecorationLine: 'underline',
  },
  legalSep: {
    marginHorizontal: 10,
    fontSize: 14,
    color: '#BDBDBD',
  },
  bottomLinkLeft: {
    flex: 1,
    paddingRight: 4,
    minWidth: 0,
  },
  bottomLinkRight: {
    flex: 1,
    paddingLeft: 4,
    minWidth: 0,
  },
  bottomLinkInnerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  bottomLinkInnerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  bottomLinkText: {
    flexShrink: 1,
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: '#212121',
    textAlign: 'left',
  },
  bottomLinkTextRight: {
    textAlign: 'right',
  },
});
