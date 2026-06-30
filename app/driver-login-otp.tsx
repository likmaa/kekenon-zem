import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthToken, setAuthToken } from './utils/authTokenStorage';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';

const CONTENT_MAX = 420;
const AUTO_VERIFY_MS = 220;

function paramStr(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? v[0] : v;
}

function formatLocalDigits(digits: string): string {
  const c = digits.replace(/\D/g, '');
  let formatted = '';
  for (let i = 0; i < c.length; i++) {
    if (i > 0 && i % 2 === 0) formatted += ' ';
    formatted += c[i];
  }
  return formatted;
}

function looksTechnicalMessage(s: string): boolean {
  const t = s.toLowerCase();
  return /exception|error:|fetch|network|undefined|kya|html|<\/?|stack|apikey|sql|json\.parse|status \d{3}/i.test(t);
}

function userFacingVerifyError(res: Response, json: unknown): string {
  const j = json as Record<string, unknown> | null;
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
    return "Ce code n'est pas bon ou n'est plus valide. Vérifiez les chiffres ou demandez un nouveau code.";
  }
  if (res.status === 429) {
    return 'Trop de tentatives. Patientez un peu avant de réessayer.';
  }
  if (res.status >= 500) {
    return 'Service temporairement indisponible. Réessayez dans quelques instants.';
  }
  return 'Impossible de vérifier le code. Vérifiez votre connexion et réessayez.';
}

export default function DriverLoginOtpScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const verifyingRef = useRef(false);
  const autoVerifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phoneParam = paramStr(params.phone as string | string[] | undefined);
  const initialOtpKey = paramStr(params.otpKey as string | string[] | undefined);

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputs = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [otpKey, setOtpKey] = useState<string>(initialOtpKey);
  const [timeLeft, setTimeLeft] = useState(30);
  const [canResend, setCanResend] = useState(false);

  const codeJoined = otp.join('');
  const codeComplete = codeJoined.length === 6;

  useEffect(() => {
    if (!phoneParam) {
      Alert.alert('Erreur', 'Numéro de téléphone manquant.');
      router.back();
    }
  }, [phoneParam, router]);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearTimeout(timer);
    }
    setCanResend(true);
  }, [timeLeft]);

  useEffect(() => {
    if (resendNotice) {
      const t = setTimeout(() => setResendNotice(null), 4000);
      return () => clearTimeout(t);
    }
  }, [resendNotice]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/driver-phone-login');
  }, [router]);

  const handlePostLoginRouting = async (): Promise<string> => {
    try {
      const token = await getAuthToken();
      if (!token || !getApiBaseUrl()) return '/driver-onboarding';

      const res = await apiFetch('/driver/profile', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const json = await res?.json().catch(() => null);
      if (!res || !res.ok || !json) return '/(tabs)';

      const status = json?.profile?.status as string | undefined;
      const role = json?.user?.role as string | undefined;
      const contractAcceptedAt = json?.profile?.contract_accepted_at as string | undefined;

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

      const cleaned = phoneParam.replace(/\s/g, '');
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
          setOtp(['', '', '', '', '', '']);
          inputs.current[0]?.focus();
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

        const targetPath = await handlePostLoginRouting();
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

  /** Soumission auto dès 6 chiffres (léger délai pour la saisie rapide). */
  useEffect(() => {
    if (!codeComplete || loading || resendLoading || !otpKey) return;
    if (autoVerifyTimerRef.current) clearTimeout(autoVerifyTimerRef.current);
    autoVerifyTimerRef.current = setTimeout(() => {
      autoVerifyTimerRef.current = null;
      void verifyOTPWithCode(codeJoined);
    }, AUTO_VERIFY_MS);
    return () => {
      if (autoVerifyTimerRef.current) {
        clearTimeout(autoVerifyTimerRef.current);
        autoVerifyTimerRef.current = null;
      }
    };
  }, [codeComplete, codeJoined, loading, resendLoading, otpKey, verifyOTPWithCode]);

  const sendOtp = async (forceNew: boolean) => {
    const cleaned = phoneParam.replace(/\s/g, '');
    if (!cleaned || !getApiBaseUrl()) {
      setError('URL API non configurée');
      return;
    }
    const e164 = `+229${cleaned}`;

    try {
      setResendLoading(true);
      setError(null);

      const res = await apiFetch('/auth/request-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        skipAuth: true,
        body: JSON.stringify({
          phone: e164,
          force_new: forceNew,
        }),
      });

      if (!res) {
        setError('URL API non configurée');
        return;
      }

      const json = await res.json().catch(() => null);
      if (!res || !res.ok || !json) {
        const msg = (json && (json.message || json.error)) || "Impossible d'envoyer le code.";
        setError(msg);
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
    setOtp(['', '', '', '', '', '']);
    setTimeLeft(30);
    setCanResend(false);
    inputs.current[0]?.focus();
    await sendOtp(true);
  };

  const handleChange = (text: string, index: number) => {
    setError(null);
    if (text.length > 1) {
      const sanitized = text.replace(/[^0-9]/g, '');
      const newOtp = [...otp];
      for (let i = 0; i < Math.min(sanitized.length, 6 - index); i++) {
        newOtp[index + i] = sanitized[i];
      }
      setOtp(newOtp);
      const nextIndex = Math.min(index + sanitized.length, 5);
      if (nextIndex < 6) {
        inputs.current[nextIndex]?.focus();
      }
      return;
    }

    if (/^[0-9]$/.test(text)) {
      const newOtp = [...otp];
      newOtp[index] = text;
      setOtp(newOtp);
      if (index < 5 && text) {
        inputs.current[index + 1]?.focus();
      }
    } else if (text === '') {
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

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
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: Math.max(insets.bottom, 20) + 24 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.column}>
                <View style={styles.kickerPill}>
                  <Ionicons name="chatbox-ellipses-outline" size={14} color={Colors.primary} />
                  <Text style={styles.kickerText}>SMS</Text>
                </View>
                <Text style={styles.title}>Code de vérification</Text>

                <Text style={styles.desc}>
                  Saisissez le code à 6 chiffres envoyé au numéro suivant : {' '}
                  <Text style={styles.phoneHighlight}>{displayPhone}</Text>
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

                <View style={styles.otpContainer}>
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => {
                        inputs.current[index] = ref;
                      }}
                      style={[styles.otpInput, focusedIndex === index && styles.otpInputFocused]}
                      keyboardType="number-pad"
                      textContentType={index === 0 ? 'oneTimeCode' : 'none'}
                      autoComplete={index === 0 ? 'sms-otp' : undefined}
                      maxLength={index === 0 ? 6 : 1}
                      value={digit}
                      onChangeText={(text) => handleChange(text, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      onFocus={() => setFocusedIndex(index)}
                      onBlur={() => setFocusedIndex(null)}
                      textAlign="center"
                      placeholder="·"
                      placeholderTextColor="#CBD5E1"
                      editable={!loading && !resendLoading}
                      accessibilityLabel={`Chiffre ${index + 1} du code`}
                    />
                  ))}
                </View>

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
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[styles.buttonText, styles.buttonTextPad]}>Vérification…</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>Vérifier le code</Text>
                  )}
                </TouchableOpacity>

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

                <Text style={styles.helperText}>
                  Le code arrive en quelques secondes. Vérifiez aussi les messages indésirables.
                </Text>
              </View>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeOuter: { flex: 1, backgroundColor: '#F1F4FB' },
  kav: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
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
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    alignItems: 'stretch',
  },
  kickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(54,80,208,0.1)',
    marginBottom: 14,
  },
  kickerText: {
    fontFamily: Fonts.titilliumWebSemiBold,
    fontSize: 12,
    color: Colors.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22,
    fontFamily: Fonts.titilliumWebBold,
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  desc: {
    fontSize: 16,
    fontFamily: Fonts.titilliumWeb,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  phoneHighlight: {
    fontFamily: Fonts.titilliumWebBold,
    color: '#0f172a',
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
    fontFamily: Fonts.titilliumWeb,
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
    fontFamily: Fonts.titilliumWeb,
    lineHeight: 20,
  },
  otpContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 22,
    gap: 6,
  },
  otpInput: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 54,
    maxWidth: 56,
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: Fonts.titilliumWebBold,
    color: '#0f172a',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  otpInputFocused: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: Colors.primary,
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
  buttonMuted: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonTextPad: {
    marginLeft: 10,
  },
  buttonText: {
    color: Colors.white,
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 17,
  },
  timerText: {
    fontSize: 14,
    fontFamily: Fonts.titilliumWeb,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 16,
  },
  resendWrap: {
    marginTop: 16,
    alignSelf: 'center',
    paddingVertical: 10,
    minHeight: 36,
    justifyContent: 'center',
  },
  resendText: {
    fontSize: 15,
    fontFamily: Fonts.titilliumWebSemiBold,
    color: Colors.primary,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  helperText: {
    fontSize: 13,
    fontFamily: Fonts.titilliumWeb,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 18,
    paddingHorizontal: 12,
  },
});
