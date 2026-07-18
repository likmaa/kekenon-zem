import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Linking,
  Image,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useDriverStore } from './providers/DriverProvider';
import { apiFetch } from './utils/apiClient';
import { getImageUrl, withImageVersion } from './utils/images';
import { Fonts } from '../font';

const GOLD = '#F5C034';
const GREEN = '#37BD6B';
const INK = '#1A1A1A';
const SHEET_BG = '#0B0B0B';
const CARD = 'rgba(255,255,255,0.04)';
const CARD_LINE = 'rgba(255,255,255,0.08)';
const MUTED = 'rgba(255,255,255,0.55)';

/**
 * Écran DÉTAIL de la course (landing après acceptation).
 * - « Appel » : toujours actif.
 * - « Aller chercher mon client » : actif si course fixe OU négociation confirmée
 *   par le client ; sinon désactivé le temps que le passager valide (verbal).
 */
export default function IncomingRideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentRide, syncCurrentRide } = useDriverStore();
  const [syncing, setSyncing] = useState(true);
  const [proposedPrice, setProposedPrice] = useState<string>('');
  const [proposing, setProposing] = useState(false);

  // Pré-remplir le champ prix avec la valeur courante (estimation / déjà proposé).
  useEffect(() => {
    if (currentRide && proposedPrice === '') {
      const v = currentRide.negotiated_fare ?? currentRide.fare;
      if (v != null) setProposedPrice(String(v));
    }
  }, [currentRide, proposedPrice]);

  // Hydrater les vraies données (pricing_mode, negotiationConfirmed) à l'ouverture,
  // puis re-synchroniser régulièrement : si le passager annule pendant qu'on est
  // sur le détail, la course disparaît et on repart à l'accueil automatiquement
  // (filet de sécurité si l'événement temps réel n'arrive pas).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const poll = async () => {
        try {
          await syncCurrentRide();
        } finally {
          if (active) setSyncing(false);
        }
      };
      poll();
      const interval = setInterval(poll, 4000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [syncCurrentRide]),
  );

  // Course refusée / annulée / terminée ailleurs → retour à l'accueil.
  useEffect(() => {
    if (syncing) return;
    if (!currentRide || currentRide.status === 'cancelled' || currentRide.status === 'completed') {
      router.replace('/(tabs)');
    }
  }, [syncing, currentRide, router]);

  // Course déjà en cours de prise en charge → on saute directement à la carte.
  useEffect(() => {
    if (currentRide && (currentRide.status === 'arrived' || currentRide.status === 'ongoing')) {
      router.replace('/pickup');
    }
  }, [currentRide, router]);

  if (syncing || !currentRide) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={styles.loaderText}>Chargement de la course…</Text>
      </View>
    );
  }

  const isNegotiable = currentRide.pricing_mode === 'negotiable';
  const canGo = !isNegotiable || !!currentRide.negotiationConfirmed;
  const isLivraison = currentRide.service_type === 'livraison';

  const passengerName = currentRide.riderName ?? 'Passager';
  const passengerPhone = currentRide.riderPhone;
  const photoUri = currentRide.riderPhoto
    ? withImageVersion(getImageUrl(currentRide.riderPhoto), currentRide.id)
    : null;

  const fareValue = currentRide.negotiated_fare ?? currentRide.fare;
  const distanceKm = currentRide.distance_m ? (currentRide.distance_m / 1000).toFixed(1) : null;

  const callPassenger = () => {
    if (!passengerPhone) {
      Alert.alert('Numéro indisponible', "Le numéro du client n'est pas disponible.");
      return;
    }
    Linking.openURL(`tel:${passengerPhone.replace(/\s/g, '')}`).catch(() =>
      Alert.alert('Erreur', "Impossible de lancer l'appel."),
    );
  };

  const goFetchClient = () => {
    if (!canGo || !currentRide) return;
    // Notifie le client que le chauffeur part le chercher (bouton suivi carte).
    apiFetch(`/driver/trips/${currentRide.id}/enroute`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    }).catch(() => {
      /* non bloquant : le suivi carte s'appuie de toute façon sur le GPS diffusé */
    });
    router.replace('/pickup');
  };

  const proposeFare = async () => {
    if (!currentRide) return;
    const fare = parseInt(proposedPrice, 10);
    if (isNaN(fare) || fare < 100) {
      Alert.alert('Prix invalide', 'Entrez un montant valide (minimum 100 F).');
      return;
    }
    setProposing(true);
    try {
      const res = await apiFetch(`/driver/trips/${currentRide.id}/propose-fare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ fare }),
      });
      if (res?.ok) {
        Alert.alert('Prix proposé', `${fare.toLocaleString('fr-FR')} F envoyé au client. En attente de sa confirmation.`);
        await syncCurrentRide();
      } else {
        const err = await res?.json().catch(() => ({}));
        Alert.alert('Erreur', err?.message || 'Impossible de proposer le prix.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de contacter le serveur.');
    } finally {
      setProposing(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={SHEET_BG} />
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="chevron-down" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détail de la course</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Montant héro */}
          <View style={styles.fareHero}>
            <View style={styles.chipsRow}>
              <View style={styles.chip}>
                {isLivraison ? (
                  <Ionicons name="cube" size={13} color={GOLD} />
                ) : (
                  <MaterialCommunityIcons name="motorbike" size={14} color={GOLD} />
                )}
                <Text style={styles.chipText}>{isLivraison ? 'Livraison' : 'Course'}</Text>
              </View>
              {distanceKm ? (
                <View style={styles.chip}>
                  <Ionicons name="navigate" size={12} color={GOLD} />
                  <Text style={styles.chipText}>{distanceKm} km</Text>
                </View>
              ) : null}
              {isNegotiable ? (
                <View style={styles.chip}>
                  <Ionicons name="chatbubbles" size={12} color={GOLD} />
                  <Text style={styles.chipText}>À négocier</Text>
                </View>
              ) : null}
            </View>
            {isNegotiable && !canGo ? (
              <>
                <Text style={styles.fareEditLabel}>Prix convenu au téléphone</Text>
                <View style={styles.fareInputRow}>
                  <TextInput
                    style={styles.fareInput}
                    keyboardType="number-pad"
                    value={proposedPrice}
                    onChangeText={setProposedPrice}
                    placeholder="0"
                    placeholderTextColor="rgba(245,192,52,0.4)"
                  />
                  <Text style={styles.fareCurrency}>FCFA</Text>
                </View>
                <TouchableOpacity style={styles.proposeBtn} onPress={proposeFare} disabled={proposing} activeOpacity={0.9}>
                  {proposing ? (
                    <ActivityIndicator color={INK} size="small" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={16} color={INK} />
                      <Text style={styles.proposeBtnText}>Proposer au client</Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.fareHint}>
                  {currentRide.negotiated_fare
                    ? `Proposé : ${currentRide.negotiated_fare.toLocaleString('fr-FR')} F — en attente de confirmation du client`
                    : 'Appelez le client, convenez du prix, puis proposez-le.'}
                </Text>
              </>
            ) : (
              <>
                <View style={styles.fareRow}>
                  <Text style={styles.fareAmount}>{fareValue.toLocaleString('fr-FR')}</Text>
                  <Text style={styles.fareCurrency}>FCFA</Text>
                </View>
                {isNegotiable ? <Text style={styles.fareHint}>Prix convenu avec le client</Text> : null}
              </>
            )}
          </View>

          {/* Passager */}
          <View style={styles.card}>
            <View style={styles.riderRow}>
              <View style={styles.avatar}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="person" size={22} color={GOLD} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.riderLabel}>Client</Text>
                <Text style={styles.riderName} numberOfLines={1}>{passengerName}</Text>
              </View>
            </View>
          </View>

          {/* Itinéraire */}
          <View style={styles.card}>
            <View style={styles.routeRow}>
              <View style={[styles.dot, { backgroundColor: GREEN }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeTag}>DÉPART</Text>
                <Text style={styles.routeAddr} numberOfLines={2}>{currentRide.pickup}</Text>
              </View>
            </View>
            <View style={styles.routeLink} />
            <View style={styles.routeRow}>
              <View style={[styles.dot, { backgroundColor: GOLD }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeTag}>DESTINATION</Text>
                {currentRide.order_mode === 'duration' ? (
                  <Text style={styles.routeAddr} numberOfLines={2}>
                    ⏱ Location horaire ({currentRide.duration_hours}h)
                  </Text>
                ) : (
                  <Text style={styles.routeAddr} numberOfLines={2}>{currentRide.dropoff}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Bandeau négociation en attente */}
          {isNegotiable && !canGo ? (
            <View style={styles.negoBanner}>
              <Ionicons name="call" size={18} color={GOLD} />
              <Text style={styles.negoBannerText}>
                Appelez le client, convenez du prix. Il confirmera dans son app pour débloquer le départ.
              </Text>
            </View>
          ) : null}

          {/* Consigne passager */}
          {currentRide.riderVoiceNote ? (
            <View style={styles.card}>
              <View style={styles.noteHeader}>
                <Ionicons name="chatbox-ellipses" size={16} color={GOLD} />
                <Text style={styles.noteTitle}>Consigne du client</Text>
              </View>
              <Text style={styles.noteText}>{currentRide.riderVoiceNote}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Actions */}
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <TouchableOpacity style={styles.callBtn} onPress={callPassenger} activeOpacity={0.85}>
            <Ionicons name="call" size={22} color={GOLD} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.goBtn, !canGo && styles.goBtnDisabled]}
            onPress={goFetchClient}
            disabled={!canGo}
            activeOpacity={0.9}
          >
            {canGo ? (
              <Ionicons name="navigate" size={20} color={INK} />
            ) : (
              <Ionicons name="lock-closed" size={18} color="rgba(26,26,26,0.5)" />
            )}
            <Text style={[styles.goBtnText, !canGo && styles.goBtnTextDisabled]}>
              {canGo ? 'Aller chercher mon client' : 'En attente du client'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHEET_BG },
  safe: { flex: 1 },
  loader: { flex: 1, backgroundColor: SHEET_BG, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loaderText: { fontFamily: Fonts.medium, fontSize: 14, color: MUTED },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: Fonts.bold, fontSize: 17, color: '#FFFFFF' },
  scroll: { paddingHorizontal: 18, paddingBottom: 20, gap: 12 },
  fareHero: {
    backgroundColor: 'rgba(245, 192, 52, 0.12)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(245, 192, 52, 0.25)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipText: { fontFamily: Fonts.bold, fontSize: 12, color: '#FFFFFF' },
  fareRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  fareAmount: { fontFamily: Fonts.bold, fontSize: 40, color: GOLD, letterSpacing: -1 },
  fareCurrency: { fontFamily: Fonts.bold, fontSize: 15, color: GOLD, opacity: 0.75 },
  fareHint: { fontFamily: Fonts.regular, fontSize: 12, color: MUTED, marginTop: 6, textAlign: 'center' },
  fareEditLabel: { fontFamily: Fonts.medium, fontSize: 12, color: MUTED, marginBottom: 2 },
  fareInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  fareInput: {
    fontFamily: Fonts.bold,
    fontSize: 40,
    color: GOLD,
    letterSpacing: -1,
    padding: 0,
    minWidth: 120,
    textAlign: 'center',
  },
  proposeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginTop: 12,
    alignSelf: 'stretch',
  },
  proposeBtnText: { fontFamily: Fonts.bold, fontSize: 15, color: INK },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_LINE,
    padding: 14,
  },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(245, 192, 52, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  riderLabel: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  riderName: { fontFamily: Fonts.bold, fontSize: 16, color: '#FFFFFF' },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeLink: {
    width: 2,
    height: 18,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginLeft: 4,
    marginVertical: 3,
  },
  routeTag: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: GOLD,
    letterSpacing: 0.9,
    marginBottom: 3,
    opacity: 0.9,
  },
  routeAddr: { fontFamily: Fonts.semiBold, fontSize: 14, color: '#FFFFFF', lineHeight: 20 },
  negoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(245, 192, 52, 0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 192, 52, 0.25)',
    padding: 14,
  },
  negoBannerText: { flex: 1, fontFamily: Fonts.medium, fontSize: 13, color: '#FFFFFF', lineHeight: 18 },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  noteTitle: { fontFamily: Fonts.bold, fontSize: 13, color: '#FFFFFF' },
  noteText: { fontFamily: Fonts.regular, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 19 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CARD_LINE,
  },
  callBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(245, 192, 52, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 192, 52, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: GOLD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  goBtnDisabled: { backgroundColor: 'rgba(245, 192, 52, 0.25)' },
  goBtnText: { fontFamily: Fonts.bold, fontSize: 16, color: INK },
  goBtnTextDisabled: { color: 'rgba(26,26,26,0.5)' },
});
