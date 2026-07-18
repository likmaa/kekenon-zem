import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../theme';
import { Fonts } from '../../../font';
import type { Ride } from '../../providers/DriverProvider';

type Props = {
  ride: Ride;
  passengerName: string;
  passengerPhone?: string;
  passengerPhotoUri: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  fareDisplay: string;
  eta: number;
  distance: number | null;
  liveStopSeconds: number;
  onCall: () => void;
  onWhatsApp: () => void;
  onStartStop: () => void;
  onEndStop: () => void;
  onCallRecipient: () => void;
};

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

function WaitTimer({ arrivedAt }: { arrivedAt: string }) {
  const [seconds, setSeconds] = React.useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 1000)),
  );

  React.useEffect(() => {
    const start = new Date(arrivedAt).getTime();
    const interval = setInterval(() => {
      setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [arrivedAt]);

  const graceSeconds = 5 * 60;
  const overGrace = seconds > graceSeconds;
  const displayed = overGrace ? seconds - graceSeconds : graceSeconds - seconds;

  return (
    <View style={[styles.waitCard, overGrace && styles.waitCardLate]}>
      <Ionicons name={overGrace ? 'warning' : 'hourglass-outline'} size={20} color={overGrace ? Colors.error : Colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.microLabel}>{overGrace ? 'Attente facturée' : 'Délai de grâce'}</Text>
        <Text style={[styles.waitValue, overGrace && { color: Colors.error }]}>{formatDuration(displayed)}</Text>
      </View>
      {overGrace ? <Text style={styles.waitFee}>+{Math.floor(displayed / 60) * 10} F</Text> : null}
    </View>
  );
}

export function DriverRideDetails({
  ride,
  passengerName,
  passengerPhone,
  passengerPhotoUri,
  pickupAddress,
  dropoffAddress,
  fareDisplay,
  eta,
  distance,
  liveStopSeconds,
  onCall,
  onWhatsApp,
  onStartStop,
  onEndStop,
  onCallRecipient,
}: Props) {
  const isOngoing = ride.status === 'ongoing';
  const isArrived = ride.status === 'arrived';

  return (
    <View style={styles.container}>
      <View style={styles.contactRow}>
        <View style={styles.avatar}>
          {passengerPhotoUri ? (
            <Image source={{ uri: passengerPhotoUri }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person" size={22} color={Colors.primary} />
          )}
        </View>
        <View style={styles.contactText}>
          <Text style={styles.microLabel}>{ride.service_type === 'livraison' ? 'Expéditeur' : 'Votre client'}</Text>
          <Text style={styles.passengerName} numberOfLines={1}>{passengerName}</Text>
          {passengerPhone ? <Text style={styles.passengerPhone} numberOfLines={1}>{passengerPhone}</Text> : null}
        </View>
        <View style={styles.contactActions}>
          <TouchableOpacity style={styles.iconButton} onPress={onWhatsApp}>
            <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={onCall}>
            <Ionicons name="call" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.quickRow}>
        <View style={styles.quickItem}>
          <Text style={styles.microLabel}>{isOngoing ? 'Arrivée prévue' : isArrived ? 'Statut' : 'Proximité'}</Text>
          <Text style={styles.quickValue}>{isArrived ? 'Sur place' : `${eta} min`}</Text>
        </View>
        {isOngoing ? (
          <View style={styles.quickItem}>
            <Text style={styles.microLabel}>Distance</Text>
            <Text style={styles.quickValue}>{distance ? `${distance.toFixed(1)} km` : 'Calcul...'}</Text>
          </View>
        ) : null}
        <View style={[styles.quickItem, styles.priceItem]}>
          <Text style={styles.microLabel}>{isOngoing ? 'Prix actuel' : 'Prix estimé'}</Text>
          <Text style={styles.priceValue}>{fareDisplay}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.routeRow}>
        <View style={styles.routePoint}>
          <View style={styles.routeLabelRow}>
            <View style={styles.pickupDot} />
            <Text style={styles.microLabel}>Départ</Text>
          </View>
          <Text style={styles.address} numberOfLines={1}>{pickupAddress}</Text>
        </View>

        <View style={styles.routeArrow}>
          <Ionicons name="arrow-forward" size={17} color="rgba(255,255,255,0.45)" />
        </View>

        <View style={styles.routePoint}>
          <View style={styles.routeLabelRow}>
            <View style={styles.dropoffDot} />
            <Text style={styles.microLabel}>Destination</Text>
          </View>
          <Text style={styles.address} numberOfLines={1}>
            {ride.order_mode === 'duration' ? `Location horaire (${ride.duration_hours}h)` : dropoffAddress}
          </Text>
        </View>
      </View>

      {isArrived && ride.arrived_at ? <WaitTimer arrivedAt={ride.arrived_at} /> : null}

      {isOngoing ? (
        <View style={[styles.stopCard, ride.stop_started_at && styles.stopCardActive]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.microLabel}>Temps d'arrêt total</Text>
            <Text style={styles.stopValue}>
              {Math.floor(((ride.total_stop_duration_s ?? 0) + (ride.stop_started_at ? liveStopSeconds : 0)) / 60)} min
            </Text>
            {ride.stop_started_at ? <Text style={styles.liveTimer}>En cours : {formatDuration(liveStopSeconds)}</Text> : null}
          </View>
          <TouchableOpacity
            style={[styles.stopButton, ride.stop_started_at ? styles.resumeButton : styles.pauseButton]}
            onPress={ride.stop_started_at ? onEndStop : onStartStop}
          >
            <Ionicons name={ride.stop_started_at ? 'play' : 'pause'} size={18} color={Colors.dark} />
            <Text style={styles.stopButtonText}>{ride.stop_started_at ? 'Reprendre' : 'Arrêt'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isOngoing && ride.service_type === 'livraison' ? (
        <View style={styles.deliveryCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.microLabel}>Destinataire du colis</Text>
            <Text style={styles.deliveryName}>{ride.recipient_name || 'Non précisé'}</Text>
            {ride.package_description ? <Text style={styles.deliveryDescription}>{ride.package_description}</Text> : null}
          </View>
          <TouchableOpacity style={styles.navigationButtonRound} onPress={onCallRecipient} disabled={!ride.recipient_phone}>
            <Ionicons name="call" size={18} color={Colors.dark} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 12 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  avatarImage: { width: 48, height: 48 },
  contactText: { flex: 1, minWidth: 65 },
  passengerName: { fontFamily: Fonts.bold, fontSize: 17, color: Colors.white },
  passengerPhone: { fontFamily: Fonts.regular, fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  contactActions: { flexDirection: 'row', gap: 6 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickItem: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  priceItem: { backgroundColor: 'rgba(253,216,53,0.12)', borderColor: 'rgba(253,216,53,0.25)' },
  microLabel: { fontFamily: Fonts.bold, fontSize: 10, letterSpacing: 0.1, color: 'rgba(255,255,255,0.45)' },
  quickValue: { marginTop: 2, fontFamily: Fonts.bold, fontSize: 17, color: Colors.white },
  priceValue: { marginTop: 2, fontFamily: Fonts.bold, fontSize: 16, color: Colors.primary },
  waitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(253,216,53,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(253,216,53,0.24)',
  },
  waitCardLate: { backgroundColor: 'rgba(229,57,53,0.1)', borderColor: 'rgba(229,57,53,0.35)' },
  waitValue: { fontFamily: Fonts.bold, fontSize: 17, color: Colors.white },
  waitFee: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.error },
  divider: { height: 1, marginVertical: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  routePoint: { flex: 1, minWidth: 0 },
  routeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pickupDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#43A047' },
  dropoffDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error },
  address: { marginTop: 1, fontFamily: Fonts.semiBold, fontSize: 14, color: Colors.white },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stopCardActive: { backgroundColor: 'rgba(253,216,53,0.1)', borderColor: 'rgba(253,216,53,0.28)' },
  stopValue: { fontFamily: Fonts.bold, fontSize: 18, color: Colors.white },
  liveTimer: { fontFamily: Fonts.semiBold, fontSize: 11, color: Colors.primary },
  stopButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12 },
  pauseButton: { backgroundColor: Colors.primary },
  resumeButton: { backgroundColor: '#43A047' },
  stopButtonText: { fontFamily: Fonts.bold, fontSize: 11, color: Colors.dark },
  deliveryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  deliveryName: { marginTop: 2, fontFamily: Fonts.bold, fontSize: 15, color: Colors.white },
  deliveryDescription: { marginTop: 2, fontFamily: Fonts.regular, fontSize: 12, color: 'rgba(255,255,255,0.55)' },
  navigationButtonRound: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
});
