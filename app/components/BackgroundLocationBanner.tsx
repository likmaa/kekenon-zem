import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme';
import { Fonts } from '../../font';

/**
 * Bandeau d'accueil chauffeur : tant que la localisation « Toujours autoriser »
 * (arrière-plan) n'est pas accordée, le suivi GPS s'arrête dès que l'écran est
 * verrouillé → l'odomètre ne mesure pas la distance réelle de la course et la
 * facturation retombe sur l'estimation. Ce bandeau guide le réglage une bonne
 * fois (pensé pour les téléphones dédiés de la flotte). Il disparaît une fois
 * « Toujours » accordé.
 */
export function BackgroundLocationBanner() {
  // 'checking' | 'ok' (always granted) | 'foreground' (while-using only) | 'denied'
  const [status, setStatus] = useState<'checking' | 'ok' | 'foreground' | 'denied'>('checking');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        setStatus('denied');
        return;
      }
      const bg = await Location.getBackgroundPermissionsAsync();
      setStatus(bg.status === 'granted' ? 'ok' : 'foreground');
    } catch {
      // En cas d'erreur on n'affiche pas le bandeau pour ne pas gêner.
      setStatus('ok');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const handleEnable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 1) S'assurer du premier plan d'abord (prérequis du background).
      let fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted' && fg.canAskAgain) {
        fg = await Location.requestForegroundPermissionsAsync();
      }
      if (fg.status !== 'granted') {
        Alert.alert(
          'Localisation requise',
          "Ouvrez les réglages et autorisez la localisation pour TIC Driver, puis revenez.",
          [{ text: 'Plus tard', style: 'cancel' }, { text: 'Réglages', onPress: openSettings }],
        );
        return;
      }

      // 2) Demander l'arrière-plan (« Toujours autoriser »).
      const existingBg = await Location.getBackgroundPermissionsAsync();
      let bgStatus = existingBg.status;
      if (bgStatus !== 'granted' && existingBg.canAskAgain) {
        const req = await Location.requestBackgroundPermissionsAsync();
        bgStatus = req.status;
      }

      if (bgStatus === 'granted') {
        await refresh();
        Alert.alert(
          'Suivi activé',
          Platform.OS === 'android'
            ? "Parfait. Pour une fiabilité maximale, désactivez aussi l'optimisation de batterie pour TIC Driver dans les réglages."
            : 'Parfait. La distance réelle de vos courses sera désormais mesurée.',
          Platform.OS === 'android'
            ? [{ text: 'Plus tard', style: 'cancel' }, { text: 'Réglages batterie', onPress: openSettings }]
            : [{ text: 'OK' }],
        );
      } else {
        // canAskAgain = false → il faut passer par les réglages système.
        Alert.alert(
          'Activer « Toujours autoriser »',
          "Dans les réglages : Localisation → choisissez « Toujours autoriser » pour TIC Driver. Cela permet de mesurer la distance réelle de la course même écran verrouillé.",
          [{ text: 'Plus tard', style: 'cancel' }, { text: 'Ouvrir les réglages', onPress: openSettings }],
        );
      }
    } catch {
      Alert.alert('Erreur', "Impossible de demander la permission. Ouvrez les réglages.", [
        { text: 'OK', onPress: openSettings },
      ]);
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [busy, openSettings, refresh]);

  if (status === 'checking' || status === 'ok') return null;

  const isDenied = status === 'denied';

  return (
    <TouchableOpacity
      style={styles.banner}
      activeOpacity={0.9}
      onPress={() => void handleEnable()}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Activer la localisation en arrière-plan"
    >
      <View style={styles.iconWrap}>
        <Ionicons name={isDenied ? 'location-outline' : 'navigate-circle-outline'} size={20} color={Colors.white} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {isDenied ? 'Localisation désactivée' : 'Activez « Toujours autoriser »'}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {isDenied
            ? 'Sans position, vous ne recevez pas les courses. Appuyez pour activer.'
            : 'Pour mesurer la distance réelle de la course (écran verrouillé). Appuyez pour activer.'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E8841B',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 13.5,
    color: Colors.white,
    marginBottom: 1,
  },
  body: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 11.5,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.9)',
  },
});
