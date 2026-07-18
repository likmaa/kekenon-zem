import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Fonts } from '../../font';

interface Props {
  isOnline: boolean;
  onToggle: () => void;
  loading?: boolean;
}

/**
 * Contrôle principal du conducteur : appuyer sur le casque pour passer
 * « en ligne » / « hors ligne ». Reprend le vibe de la maquette d'accueil.
 */
export default function HelmetOnlineToggle({ isOnline, onToggle, loading = false }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.hint}>
        {isOnline ? 'Appuyez sur le casque pour passer hors ligne' : 'Appuyez sur le casque pour aller en ligne'}
      </Text>

      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.85}
        disabled={loading}
        accessibilityRole="switch"
        accessibilityState={{ checked: isOnline, busy: loading }}
        accessibilityLabel={isOnline ? 'Statut : en ligne' : 'Statut : hors ligne'}
        accessibilityHint={
          isOnline
            ? 'Appuyez pour passer hors ligne et ne plus recevoir de courses'
            : 'Appuyez pour passer en ligne et recevoir des demandes'
        }
      >
        <View style={[styles.ring, isOnline ? styles.ringOnline : styles.ringOffline]}>
          <View style={[styles.circle, isOnline ? styles.circleOnline : styles.circleOffline]}>
            <Image
              source={require('../../assets/images/casque_kekenon.png')}
              style={[styles.helmet, !isOnline && styles.helmetOffline]}
              resizeMode="contain"
            />
            {loading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color="#FFFFFF" size="large" />
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>

      <Text style={[styles.status, isOnline ? styles.statusOnline : styles.statusOffline]}>
        {isOnline ? 'Vous êtes en ligne' : 'Vous êtes hors ligne'}
      </Text>
      <Text style={styles.subStatus}>
        {isOnline ? 'À l’écoute des courses à proximité.' : 'Vos clients vous attendent.'}
      </Text>
    </View>
  );
}

const CIRCLE = 170;

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', paddingVertical: 8 },
  hint: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: '#5A4B00',
    marginBottom: 18,
    textAlign: 'center',
  },
  ring: {
    width: CIRCLE + 22,
    height: CIRCLE + 22,
    borderRadius: (CIRCLE + 22) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOffline: { backgroundColor: 'rgba(41,163,86,0.18)' },
  ringOnline: { backgroundColor: 'rgba(41,163,86,0.30)' },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 10,
  },
  circleOffline: { backgroundColor: '#37BD6B' },
  circleOnline: { backgroundColor: '#29A356' },
  helmet: { width: CIRCLE * 0.72, height: CIRCLE * 0.72 },
  helmetOffline: { opacity: 0.95 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: CIRCLE / 2,
  },
  status: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    marginTop: 20,
    textAlign: 'center',
  },
  statusOffline: { color: '#1A1A1A' },
  statusOnline: { color: '#1A6B38' },
  subStatus: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: '#5A4B00',
    marginTop: 2,
    textAlign: 'center',
  },
});
