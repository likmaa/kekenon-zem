import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../../theme';
import { Fonts } from '../../../font';
import type { Ride } from '../../providers/DriverProvider';

type Props = {
  ride: Ride;
  address: string;
  eta: number;
  isOnline: boolean;
  onEtaPress: () => void;
};

export function DriverRideTopOverlay({ ride, address, eta, isOnline, onEtaPress }: Props) {
  const isOngoing = ride.status === 'ongoing';
  const isArrived = ride.status === 'arrived';
  const isDelivery = ride.service_type === 'livraison';

  const eyebrow = isOngoing
    ? 'Vers la destination'
    : isArrived
      ? 'Client prévenu'
      : isDelivery
        ? 'Collecte du colis'
        : 'Vers le client';
  const title = isOngoing
    ? 'Course en cours'
    : isArrived
      ? 'Vous êtes arrivé'
      : isDelivery
        ? 'Récupération'
        : 'Prise en charge';

  return (
    <View style={styles.wrapper}>
      <View style={styles.iconBox}>
        <MaterialCommunityIcons
          name={isOngoing ? 'map-marker-path' : isArrived ? 'map-marker-check' : 'motorbike'}
          size={24}
          color={Colors.dark}
        />
      </View>

      <View style={styles.textColumn}>
        <View style={styles.eyebrowRow}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#43A047' : Colors.error }]} />
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.address} numberOfLines={1}>{address}</Text>
      </View>

      <TouchableOpacity style={styles.etaBadge} onPress={onEtaPress} activeOpacity={0.8}>
        <Ionicons name="time-outline" size={15} color={Colors.dark} />
        <Text style={styles.etaValue}>{eta}</Text>
        <Text style={styles.etaUnit}>min</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    zIndex: 50,
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 24,
    backgroundColor: 'rgba(10,10,10,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  textColumn: { flex: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  eyebrow: {
    fontFamily: Fonts.bold,
    fontSize: 9,
    letterSpacing: 0.1,
    color: Colors.primary,
  },
  title: {
    marginTop: 2,
    fontFamily: Fonts.bold,
    fontSize: 18,
    lineHeight: 21,
    color: Colors.white,
  },
  address: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  etaBadge: {
    minWidth: 58,
    height: 58,
    paddingHorizontal: 8,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  etaValue: {
    marginTop: -2,
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 22,
    color: Colors.dark,
  },
  etaUnit: {
    marginTop: -2,
    fontFamily: Fonts.bold,
    fontSize: 9,
    color: 'rgba(26,26,26,0.65)',
  },
});
