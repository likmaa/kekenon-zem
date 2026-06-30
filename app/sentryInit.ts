/**
 * UX-05 — Sentry : chargé tôt depuis `_layout`.
 * `EXPO_PUBLIC_SENTRY_DSN` dans `.env` / EAS (optionnel).
 */
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (typeof dsn === 'string' && dsn.startsWith('https://')) {
  Sentry.init({
    dsn,
    debug: __DEV__,
    environment:
      process.env.APP_VARIANT === 'development' ? 'development' : 'production',
    enableAutoSessionTracking: true,
    tracesSampleRate: __DEV__ ? 1.0 : 0.12,
    sendDefaultPii: false,
  });
}

export function isSentryEnabled(): boolean {
  return typeof dsn === 'string' && dsn.startsWith('https://');
}
