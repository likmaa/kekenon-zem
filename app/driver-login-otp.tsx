import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  Pressable,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { setAuthToken } from './utils/authTokenStorage';

const CONTENT_MAX = 420;

function looksTechnicalMessage(s: string): boolean {
  const t = s.toLowerCase();
  return /exception|error:|fetch|network|undefined|kya|html|<\/?|stack|apikey|sql|json\.parse|status \d{3}/i.test(t);
}

function userFacingVerifyError(res: Response, json: any): string {
  const j = json as Record<string, any> | null;
  const raw =
    (typeof j?.message === 'string' && j.message.trim()) ||
    (() => {
      const errs = j?.errors;
      if (errs && typeof errs === 'object' && errs !== null) {
        const first = Object.values(errs as Record<string, string[]>).flat()[0];
        return typeof first === 'string' ? first.trim() : '';
      }
      return '';
    })();

  if (raw && !looksTechnicalMessage(raw)) {
    return raw;
  }

  if (res.status === 401 || res.status === 422) {
    return 'Ce code n’est pas bon ou n’est plus valide. Vérifiez les chiffres ou demandez un nouveau code.';
  }
  if (res.status === 429) {
    return 'Trop de tentatives. Patientez un peu avant de réessayer.';
  }
  if (res.status >= 500) {
    return 'Service temporairement indisponible. Réessayez dans quelques instants.';
  }
  return 'Impossible de vérifier le code. Vérifiez votre connexion et réessayez.';
}

export default function DriverLoginOTPScreen() {
  const { phone: phoneParam, otpKey: initialOtpKey } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const [otpKey, setOtpKey] = useState<string>((initialOtpKey as string) || '');
  const [timeLeft, setTimeLeft] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const verifyingRef = useRef(false);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
    setCanResend(true);
  }, [timeLeft]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/driver-phone-login');
  }, [router]);

  const formatLocalDigits = (raw: any): string => {
    if (typeof raw !== 'string') return '';
    const cleaned = raw.replace(/\s/g, '');
    let formatted = '';
    for (let i = 0; i < cleaned.length; i++) {
      if (i > 0 && i % 2 === 0) formatted += ' ';
      formatted += cleaned[i];
    }
    return formatted;
  };

  const sendOtp = async (isResend = false) => {
    if (resendLoading || loading) return;
    if (!getApiBaseUrl()) {
      setError('URL API non configurée');
      return;
    }

    const cleanedPhone = (phoneParam as string || '').replace(/\s/g, '');
    const e164 = `+229${cleanedPhone}`;

    try {
      setResendLoading(true);
      setError(null);
      if (isResend) setResendNotice(null);

      const res = await apiFetch('/auth/request-otp', {
        method: 'POST',
        skipAuth: true,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ phone: e164, force_new: isResend }),
      });

      if (!res || !res.ok) {
        setError('Impossible d’envoyer un nouveau code.');
        return;
      }

      const json = await res.json().catch(() => null);
      if (!json) {
        setError('Impossible d’envoyer un nouveau code.');
        return;
      }

      if (json.otp_key) {
        setOtpKey(json.otp_key as string);
      }

      setResendNotice('Un nouveau code a été envoyé par SMS.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau.';
      setError(msg);
    } finally {
      setResendLoading(false);
    }
  };

  const resendCode = async () => {
    if (!canResend || resendLoading || loading) return;
    setError(null);
    setCode('');
    setTimeLeft(30);
    setCanResend(false);
    inputRef.current?.focus();
    await sendOtp(true);
  };

  const handlePostLoginRouting = async (): Promise<string> => {
    try {
      const res = await apiFetch('/driver/profile', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res || !res.ok) return '/become-driver';
      const json = await res.json().catch(() => null);
      if (!json?.profile) return '/become-driver';

      const status = json.profile.status;
      const contractAcceptedAt = json.profile.contract_accepted_at;
      const role = json.role;
      const licenseNumber = json.profile.license_number;

      // Un chauffeur 'pending' mais qui n'a pas encore rempli son profil doit le compléter
      if (status === 'pending' && !licenseNumber) return '/become-driver';

      if (status === 'pending') return '/driver-pending-approval';
      if (status === 'rejected') return '/driver-application-rejected';
      if (status === 'approved' && role === 'driver' && contractAcceptedAt) return '/(tabs)';

      return '/driver-contract';
    } catch {
      return '/(tabs)';
    }
  };

  const verifyOTPWithCode = useCallback(
    async (code: string) => {
      if (code.length !== 6 || verifyingRef.current || loading) return;
      if (!getApiBaseUrl()) {
        setError('URL API non configurée');
        return;
      }
      if (!otpKey) {
        setError('Session OTP invalide. Revenez en arrière et redemandez un code.');
        return;
      }

      const cleaned = (phoneParam as string || '').replace(/\s/g, '');
      const e164 = `+229${cleaned}`;

      verifyingRef.current = true;
      try {
        setError(null);
        setLoading(true);
        Keyboard.dismiss();

        const res = await apiFetch('/auth/verify-otp', {
          method: 'POST',
          skipAuth: true,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            phone: e164,
            code,
            otp_key: otpKey,
            role: 'driver',
          }),
        });

        if (!res) {
          setError('URL API non configurée');
          return;
        }

        const json = await res.json().catch(() => null);
        if (!res.ok || !json) {
          setError(userFacingVerifyError(res, json));
          setCode('');
          inputRef.current?.focus();
          return;
        }

        if (!json?.token) {
          setError('La connexion n’a pas pu être finalisée. Réessayez ou demandez un nouveau code.');
          return;
        }

        try {
          await setAuthToken(json.token);
          if (json.user) {
            await AsyncStorage.setItem('authUser', JSON.stringify(json.user));
          }

          try {
            const { registerForPushNotificationsAsync, registerTokenWithBackend } = require('./utils/notificationHandler');
            const fcmToken = await registerForPushNotificationsAsync();
            if (fcmToken) {
              await registerTokenWithBackend(fcmToken, json.token);
            }
          } catch (notifyErr) {
            console.warn('Push registration failed (non-bloquant)', notifyErr);
          }
        } catch {
          /* ignore */
        }

        // Show beautiful Success Modal
        setShowSuccess(true);
        
        // Optimize: fetch routing while success animation plays
        const targetPathPromise = handlePostLoginRouting();
        await new Promise((resolve) => setTimeout(resolve, 1500));
        
        const targetPath = await targetPathPromise;
        router.replace(targetPath as never);
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : '';
        setError(
          raw && !looksTechnicalMessage(raw)
            ? raw
            : 'Problème de connexion. Vérifiez Internet et réessayez.',
        );
      } finally {
        setLoading(false);
        verifyingRef.current = false;
      }
    },
    [loading, otpKey, phoneParam, router],
  );

  const codeJoined = code;
  const codeComplete = code.length === 6;

  useEffect(() => {
    if (codeComplete) {
      void verifyOTPWithCode(codeJoined);
    }
  }, [codeJoined, codeComplete, verifyOTPWithCode]);

  const displayPhone = phoneParam ? `+229 ${formatLocalDigits(phoneParam)}` : '';

  return (
    <SafeAreaView style={styles.safeOuter}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.inner}>
            
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
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: Math.max(insets.bottom, 20) + 24 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.column}>
                <Text style={styles.title}>Vérifiez votre téléphone</Text>

                <Text style={styles.desc}>
                  Saisissez le code à 6 chiffres envoyé au numéro suivants :{' '}
                  <Text style={styles.phoneHighlight}>{displayPhone}</Text>.
                </Text>

                {resendNotice ? (
                  <View style={styles.successBanner}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#047857" style={styles.errorIcon} />
                    <Text style={styles.successText}>{resendNotice}</Text>
                  </View>
                ) : null}

                {error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={18} color={Colors.error} style={styles.errorIcon} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* OTP Inputs */}
                <Pressable style={styles.otpContainer} onPress={() => inputRef.current?.focus()}>
                  {Array.from({ length: 6 }).map((_, index) => {
                    const digit = code[index] || '';
                    const isFocused = index === code.length && focusedIndex !== null;
                    return (
                      <View
                        key={index}
                        style={[styles.otpInput, isFocused && styles.otpInputFocused]}
                      >
                        <Text style={styles.otpText}>{digit || '·'}</Text>
                      </View>
                    );
                  })}
                </Pressable>

                {/* Hidden Input field */}
                <TextInput
                  ref={inputRef}
                  value={code}
                  onChangeText={(text) => {
                    const sanitized = text.replace(/[^0-9]/g, '');
                    if (sanitized.length <= 6) {
                      setCode(sanitized);
                      setError(null);
                    }
                  }}
                  onFocus={() => setFocusedIndex(code.length)}
                  onBlur={() => setFocusedIndex(null)}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.hiddenInput}
                  autoFocus={true}
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  editable={!loading && !resendLoading}
                />

                {/* Verify Button */}
                <TouchableOpacity
                  style={[styles.button, (!codeComplete || loading || resendLoading) && styles.buttonMuted]}
                  onPress={() => void verifyOTPWithCode(codeJoined)}
                  disabled={!codeComplete || loading || resendLoading}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Vérifier le code"
                >
                  {loading ? (
                    <View style={styles.buttonInner}>
                      <ActivityIndicator color="#1A1A1A" size="small" />
                      <Text style={[styles.buttonText, styles.buttonTextPad]}>Vérification…</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>Vérifier le code</Text>
                  )}
                </TouchableOpacity>

                {/* Resend Actions */}
                <View style={styles.resendContainer}>
                  {canResend ? (
                    <TouchableOpacity
                      onPress={() => void resendCode()}
                      disabled={loading || resendLoading}
                      style={styles.resendWrap}
                    >
                      {resendLoading ? (
                        <ActivityIndicator color={Colors.primary} size="small" />
                      ) : (
                        <Text style={styles.resendText}>Renvoyer le code</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.timerText}>Renvoyer dans {timeLeft}s</Text>
                  )}
                </View>

                <Text style={styles.helperText}>
                  Le code arrive en quelques secondes. Vérifiez aussi les messages indésirables.
                </Text>
              </View>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Success Overlay */}
      {showSuccess && (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay, { zIndex: 9999, elevation: 9999, backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={80} color="#43A047" />
            <Text style={styles.successModalText}>Succès !</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeOuter: { flex: 1, backgroundColor: '#FFFFFF' },
  kav: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 56,
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
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    alignItems: 'stretch',
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: '#212121',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  desc: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 24,
    paddingHorizontal: 12,
  },
  phoneHighlight: {
    fontFamily: Fonts.bold,
    color: '#212121',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  successText: {
    flex: 1,
    color: '#047857',
    fontSize: 14,
    fontFamily: Fonts.regular,
    lineHeight: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
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
  otpContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 32,
    gap: 8,
  },
  otpInput: {
    flex: 1,
    height: 52,
    maxWidth: 52,
    borderColor: '#E0E0E0',
    borderWidth: 1.5,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  otpText: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: '#212121',
    textAlign: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpInputFocused: {
    borderColor: Colors.primary,
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  button: {
    backgroundColor: Colors.primary,
    height: 54,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  buttonMuted: {
    opacity: 0.5,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonTextPad: {
    marginLeft: 8,
    color: '#1A1A1A',
  },
  buttonText: {
    color: '#1A1A1A',
    fontFamily: Fonts.bold,
    fontSize: 17,
  },
  resendContainer: {
    marginTop: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  resendWrap: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  resendText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.primary,
    textAlign: 'center',
  },
  helperText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 18,
    paddingHorizontal: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successCard: {
    width: 260,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  successModalText: {
    marginTop: 18,
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: '#212121',
    textAlign: 'center',
  },
});
