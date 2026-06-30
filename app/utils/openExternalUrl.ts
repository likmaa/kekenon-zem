import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

function isHttpUrl(url: string): boolean {
  const lowered = url.trim().toLowerCase();
  return lowered.startsWith("https://") || lowered.startsWith("http://");
}

// Pour les URLs web (http/https), WebBrowser est l'API correcte — Linking.openURL
// peut échouer silencieusement sur certains Android et remonte l'erreur via Sentry
// avant que le try/catch JS puisse l'intercepter.
// Pour les schémas natifs (tel:, mailto:, wa.me…), Linking reste nécessaire.
export async function openExternalUrl(url: string): Promise<boolean> {
  const target = url.trim();
  if (!target) return false;

  if (isHttpUrl(target)) {
    try {
      await WebBrowser.openBrowserAsync(target);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const canOpen = await Linking.canOpenURL(target);
    if (canOpen) {
      await Linking.openURL(target);
      return true;
    }
  } catch {
    // schéma natif non géré sur cet appareil
  }

  return false;
}

/**
 * Ouvre la navigation GPS vers (lat, lon) : essaie les apps natives (Waze / Google Maps)
 * puis retombe sur l'URL web universelle.
 *
 * IMPORTANT iOS : `canOpenURL` LÈVE une exception si le schéma n'est pas déclaré dans
 * LSApplicationQueriesSchemes (Info.plist). Chaque tentative est donc entourée d'un
 * try/catch pour ne jamais bloquer et toujours retomber sur le fallback web.
 */
export async function openNavigation(
  lat: number,
  lon: number,
  navPref: "auto" | "waze" | "gmaps" = "auto",
): Promise<boolean> {
  const waze = `waze://?ll=${lat},${lon}&navigate=yes`;
  const gmaps = `comgooglemaps://?daddr=${lat},${lon}&directionsmode=driving`;
  const schemes = navPref === "waze" ? [waze, gmaps] : [gmaps, waze];

  for (const url of schemes) {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      // schéma non whitelisté / app non installée → on tente le suivant
    }
  }

  // Fallback web universel — Linking.openURL pour sortir de l'app (Maps / Safari / Chrome)
  const web = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
  try {
    await Linking.openURL(web);
    return true;
  } catch {
    return openExternalUrl(web);
  }
}

