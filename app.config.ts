import { ExpoConfig, ConfigContext } from "expo/config";
import baseConfig from "./app.json";
import fs from "fs";
import path from "path";

const baseExpo = baseConfig.expo as ExpoConfig;

/** Petite fonction pour lire le .env manuellement si process.env est vide (utile pour EAS local) */
const getEnv = (key: string): string | undefined => {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = path.resolve(__dirname, ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");
      const lines = envContent.split("\n");
      for (const line of lines) {
        const [k, ...v] = line.split("=");
        if (k.trim() === key) return v.join("=").trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch (err) {
    console.warn(`[app.config.ts] Erreur lors de la lecture manuelle du .env pour ${key}:`, err);
  }
  return undefined;
};

const IS_DEV = getEnv("APP_VARIANT") === "development";
/** Laravel / IP LAN en `http://` : sans cleartext explicite, Android bloque → « Network request failed ». */
const API_USES_HTTP = (getEnv("EXPO_PUBLIC_API_URL") ?? "").trim().toLowerCase().startsWith("http://");
const ALLOW_CLEARTEXT = IS_DEV || API_USES_HTTP;

const iosForApi =
  API_USES_HTTP && baseExpo.ios
    ? {
        ...baseExpo.ios,
        infoPlist: {
          ...(baseExpo.ios.infoPlist ?? {}),
          NSAppTransportSecurity: {
            NSAllowsLocalNetworking: true,
          },
        },
      }
    : baseExpo.ios;

/** Secret Mapbox (téléchargement SDK Gradle/CocoaPods) — jamais en dur ; EAS Secret ou .env local. */
const MAPBOX_DOWNLOAD_TOKEN = getEnv("MAPBOX_DOWNLOAD_TOKEN");

if (!MAPBOX_DOWNLOAD_TOKEN) {
  throw new Error(
    "[apk-tic-driver] MAPBOX_DOWNLOAD_TOKEN manquant. Créez un secret EAS (eas secret:create) ou ajoutez-le dans .env — voir env.example."
  );
}

const config: ExpoConfig = {
  ...baseExpo,
  ios: iosForApi,
  plugins: [
    // Correctifs natifs anti-crash (Sentry) — voir dossier ./plugins
    "./plugins/withOnResumeGuard",
    "./plugins/withMapboxLocationGuard",
    "./plugins/withNativeDebugSymbols",
    "./plugins/withFmtConstevalFix",
    "@sentry/react-native",
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    "expo-router",
    "expo-task-manager",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/LOGO_OR.png",
        imageWidth: 150,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    "expo-location",
    "expo-font",
    [
      "@rnmapbox/maps",
      {
        RNMapboxMapsImpl: "mapbox",
        RNMapboxDownloadToken: MAPBOX_DOWNLOAD_TOKEN,
      },
    ],
    [
      "expo-notifications",
      {
        sounds: [
          "./assets/sounds/ride.wav",
          "./assets/sounds/wallet.wav",
          "./assets/sounds/promo.wav",
          "./assets/sounds/tic_default.wav",
        ],
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: ALLOW_CLEARTEXT,
        },
        ios: {
          extraPods: [
            { name: "GoogleUtilities", modular_headers: true },
            { name: "GoogleDataTransport", modular_headers: true },
          ],
        },
      },
    ],
  ],
};

export default ({ config: _config }: ConfigContext): ExpoConfig => config;
