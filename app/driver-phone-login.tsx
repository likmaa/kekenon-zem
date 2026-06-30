import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
          router.replace('/(tabs)' as const);
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
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.innerContainer}>
            <View style={[styles.backRow, { top: Math.max(insets.top, 8) + 4 }]}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel="Retour"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="chevron-back" size={22} color="#1e293b" />
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
                <View style={styles.logoWrap}>
                  <Image
                    source={require('../assets/images/LOGO_OR.png')}
                    style={styles.logo}
                    resizeMode="contain"
                    accessibilityLabel="Kêkênon"
                  />
                </View>

                <View style={styles.headerSection}>
                  <Text style={styles.title}>Connexion chauffeur</Text>
                  <Text style={styles.subtitle}>
                    Nous vous envoyons un code de validation par SMS.
                  </Text>
                </View>

                <View
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
                    placeholder="01 97 23 45 67"
                    value={phone}
                    onChangeText={handlePhoneChange}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    keyboardType="number-pad"
                    style={styles.input}
                    placeholderTextColor="#94A3B8"
                    maxLength={14}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (!loading) void sendOTP();
                    }}
                    accessibilityLabel="Numéro de téléphone sans indicatif"
                  />
                </View>

                {error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={18} color={Colors.error} style={styles.errorIcon} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.footer}>
                  <TouchableOpacity
                    style={[styles.button, (loading || !isPhoneValid) && styles.buttonDisabled]}
                    onPress={() => void sendOTP()}
                    disabled={loading || !isPhoneValid}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: loading || !isPhoneValid }}
                  >
                    {loading ? (
                      <View style={styles.buttonInner}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={[styles.buttonText, styles.buttonTextLoading]}>Envoi…</Text>
                      </View>
                    ) : (
                      <Text style={styles.buttonText}>Continuer</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.legalRow}>
                  <TouchableOpacity onPress={() => void openExternalUrl(LEGAL_CGU)} accessibilityRole="link">
                    <Text style={styles.legalLink}>CGU</Text>
                  </TouchableOpacity>
                  <Text style={styles.legalSep}>·</Text>
                  <TouchableOpacity onPress={() => void openExternalUrl(LEGAL_PRIVACY)} accessibilityRole="link">
                    <Text style={styles.legalLink}>Confidentialité</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <View style={styles.bottomLinksInner}>
                <TouchableOpacity
                  style={styles.bottomLinkLeft}
                  onPress={() => router.replace('/driver-onboarding')}
                  accessibilityRole="button"
                  accessibilityLabel="Revoir l’introduction"
                >
                  <View style={styles.bottomLinkInnerLeft}>
                    <Ionicons name="play-outline" size={17} color={Colors.primary} />
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
                    <Ionicons name="help-circle-outline" size={18} color={Colors.primary} />
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
    backgroundColor: '#F1F4FB',
  },
  container: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 24,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F1F4FB',
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
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
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
  logo: {
    width: 168,
    height: 56,
  },
  headerSection: {
    marginBottom: 28,
    alignItems: 'center',
  },
  title: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 22,
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 16,
    color: '#64748B',
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 360,
    alignSelf: 'center',
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 12,
    minHeight: 60,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  inputCardFocused: {
    borderColor: Colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
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
    borderRightColor: '#E2E8F0',
  },
  inputFlagCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  flagEmoji: {
    fontSize: 18,
  },
  countryCode: {
    fontSize: 17,
    fontFamily: Fonts.titilliumWebBold,
    color: '#0f172a',
    minWidth: 44,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontFamily: Fonts.titilliumWeb,
    color: '#0f172a',
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
    fontFamily: Fonts.titilliumWeb,
    lineHeight: 20,
  },
  footer: {
    marginTop: 28,
    width: '100%',
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 56,
    shadowColor: Colors.primary,
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.72,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonText: {
    color: '#FFF',
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 17,
  },
  buttonTextLoading: {
    marginLeft: 4,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    flexWrap: 'wrap',
  },
  legalLink: {
    fontFamily: Fonts.titilliumWebSemiBold,
    fontSize: 14,
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  legalSep: {
    marginHorizontal: 10,
    fontSize: 14,
    color: '#94A3B8',
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
    fontFamily: Fonts.titilliumWebSemiBold,
    fontSize: 13,
    color: Colors.primary,
    textAlign: 'left',
  },
  bottomLinkTextRight: {
    textAlign: 'right',
  },
});
