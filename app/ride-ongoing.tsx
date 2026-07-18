import { Redirect } from 'expo-router';

/**
 * Route de compatibilité pour les anciennes notifications et les liens déjà
 * distribués. Le trajet complet vit désormais dans /pickup afin de conserver
 * une seule instance de Mapbox du départ vers le client jusqu'à la destination.
 */
export default function LegacyRideOngoingRedirect() {
  return <Redirect href="/pickup" />;
}
