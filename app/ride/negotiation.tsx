// app/ride/negotiation.tsx
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../theme';
import { Fonts } from '../../font';
import { apiFetch } from '@/app/utils/apiClient';
import { getAuthToken } from '@/app/utils/authTokenStorage';
import { getPusherClient, unsubscribeChannel } from '../services/pusherClient';
import { useDriverStore } from '../providers/DriverProvider';

export default function Negotiation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ rideId?: string }>();
  const rideId = params.rideId;

  const { syncCurrentRide } = useDriverStore();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [rideDetails, setRideDetails] = useState<any>(null);
  const [proposals, setProposals] = useState<any[]>([]);
  const [customPrice, setCustomPrice] = useState<string>('');

  const scrollRef = useRef<ScrollView>(null);

  // Charger les détails de la course et l'historique
  const fetchData = useCallback(async () => {
    if (!rideId) return;
    try {
      const [rideRes, bidsRes] = await Promise.all([
        apiFetch(`/driver/rides/${rideId}`),
        apiFetch(`/driver/rides/${rideId}/bids`),
      ]);

      if (rideRes?.ok) {
        const rideData = await rideRes.json();
        setRideDetails(rideData);
        // Si le tarif négocié est déjà fixé sur la course, on passe directement au pickup
        if (rideData.status === 'accepted' && rideData.negotiated_fare) {
          await syncCurrentRide();
          router.replace('/pickup');
          return;
        }
      }

      if (bidsRes?.ok) {
        const bidsData = await bidsRes.json();
        setProposals(bidsData.bids || []);
      }
    } catch (e) {
      console.warn('Erreur chargement négociation:', e);
    } finally {
      setLoading(false);
    }
  }, [rideId, syncCurrentRide, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Écouter Pusher
  useEffect(() => {
    if (!rideId) return;
    let channel: any = null;
    let cancelled = false;

    const subscribe = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const client = await getPusherClient();
        channel = client.subscribe(`private-ride.${rideId}`);

        // Réception d'une nouvelle offre
        channel.bind('bid.submitted', (payload: any) => {
          if (cancelled) return;
          const newBid = payload?.bid;
          if (newBid) {
            setProposals((prev) => {
              const filtered = prev.filter((b) => b.id !== newBid.id);
              return [...filtered, newBid].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            });
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
          }
        });

        // Négociation validée par le passager
        channel.bind('bid.accepted', (payload: any) => {
          if (cancelled) return;
          Alert.alert('Accord trouvé !', `Le tarif de ${payload.fare} FCFA a été validé. En route !`, [
            {
              text: 'C\'est parti',
              onPress: async () => {
                await syncCurrentRide();
                router.replace('/pickup');
              },
            },
          ]);
        });
      } catch (error) {
        console.warn('Realtime subscription failed', error);
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      unsubscribeChannel(channel);
    };
  }, [rideId, router, syncCurrentRide]);

  // Soumettre une proposition
  const handleSendProposal = async () => {
    const priceNum = parseInt(customPrice);
    if (isNaN(priceNum) || priceNum < 100) {
      Alert.alert('Erreur', 'Veuillez entrer un montant valide supérieur à 100 FCFA.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/driver/rides/${rideId}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposed_fare: priceNum }),
      });
      if (res?.ok) {
        const data = await res.json();
        setProposals((prev) => [...prev, data.bid]);
        setCustomPrice('');
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        const err = await res?.json().catch(() => ({}));
        Alert.alert('Erreur', err?.message || 'Impossible d’envoyer la proposition.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de contacter le serveur.');
    } finally {
      setSubmitting(false);
    }
  };

  // Accepter l'offre du Passager
  const handleAcceptProposal = async (proposalId: number) => {
    setAcceptingId(proposalId);
    try {
      const res = await apiFetch(`/driver/rides/${rideId}/accept-bid/${proposalId}`, {
        method: 'POST',
      });
      if (res?.ok) {
        await syncCurrentRide();
        router.replace('/pickup');
      } else {
        const err = await res?.json().catch(() => ({}));
        Alert.alert('Erreur', err?.message || 'Impossible d’accepter cette offre.');
      }
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de joindre le serveur.');
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loaderText}>Connexion au passager...</Text>
      </SafeAreaView>
    );
  }

  const riderName = rideDetails?.passenger_name || rideDetails?.rider?.name || 'Passager';

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header Passager */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.black} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Négociation du prix</Text>
            <Text style={styles.headerSub}>Client : {riderName}</Text>
          </View>
        </View>

        {/* Détails Trajet */}
        <View style={styles.routeCard}>
          <View style={styles.routeHeader}>
            <Ionicons name="map-outline" size={18} color={Colors.primary} />
            <Text style={styles.routeTitle}>Itinéraire demandé</Text>
          </View>
          <View style={styles.routeTimeline}>
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.routeAddr} numberOfLines={1}>
                {rideDetails?.pickup_address || 'Départ'}
              </Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
              <Text style={styles.routeAddr} numberOfLines={1}>
                {rideDetails?.dropoff_address || 'Destination'}
              </Text>
            </View>
          </View>
        </View>

        {/* Liste des Prix Proposés */}
        <ScrollView
          ref={scrollRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {proposals.map((proposal) => {
            const isMe = proposal.sender?.role === 'driver';
            return (
              <View
                key={proposal.id}
                style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}
              >
                <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
                  <Text style={[styles.proposedFare, isMe ? styles.fareRight : styles.fareLeft]}>
                    {proposal.proposed_fare} FCFA
                  </Text>
                  <Text style={[styles.msgTime, isMe ? styles.timeRight : styles.timeLeft]}>
                    {isMe ? 'Votre proposition' : 'Offre du passager'}
                  </Text>
                  {!isMe && proposal.status === 'pending' && (
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAcceptProposal(proposal.id)}
                      disabled={acceptingId !== null}
                    >
                      {acceptingId === proposal.id ? (
                        <ActivityIndicator size="small" color={Colors.black} />
                      ) : (
                        <Text style={styles.acceptBtnText}>Accepter ce tarif</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Zone d'envoi et boutons */}
        <View style={styles.inputPanel}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.priceInput}
              placeholder="Votre prix..."
              keyboardType="number-pad"
              value={customPrice}
              onChangeText={setCustomPrice}
              placeholderTextColor={Colors.gray}
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={handleSendProposal}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.black} />
              ) : (
                <Ionicons name="send" size={20} color={Colors.black} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.presetsRow}>
            {[100, 200, 500].map((val) => (
              <TouchableOpacity
                key={val}
                style={styles.presetChip}
                onPress={() => {
                  const lastFare = proposals[proposals.length - 1]?.proposed_fare || rideDetails?.fare_amount || 500;
                  setCustomPrice(String(lastFare + val));
                }}
              >
                <Text style={styles.presetChipText}>+{val} F</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFB',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  loaderText: {
    marginTop: 16,
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.gray,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: Colors.white,
  },
  backBtn: {
    padding: 6,
    marginRight: 10,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.black,
  },
  headerSub: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.gray,
    marginTop: 1,
  },
  routeCard: {
    backgroundColor: Colors.white,
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  routeTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.black,
  },
  routeTimeline: {
    gap: 8,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeAddr: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.black,
    flex: 1,
  },
  routeLine: {
    width: 2,
    height: 10,
    backgroundColor: '#E5E7EB',
    marginLeft: 3,
  },
  chatScroll: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  chatContent: {
    padding: 16,
    gap: 12,
  },
  msgWrapper: {
    flexDirection: 'row',
    width: '100%',
  },
  msgRight: {
    justifyContent: 'flex-end',
  },
  msgLeft: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 18,
  },
  bubbleRight: {
    backgroundColor: '#E8ECF4',
    borderBottomRightRadius: 4,
  },
  bubbleLeft: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  proposedFare: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    marginBottom: 4,
  },
  fareRight: {
    color: Colors.black,
  },
  fareLeft: {
    color: '#F9A825',
  },
  msgTime: {
    fontFamily: Fonts.regular,
    fontSize: 11,
  },
  timeRight: {
    color: Colors.gray,
  },
  timeLeft: {
    color: Colors.gray,
  },
  acceptBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.black,
  },
  inputPanel: {
    backgroundColor: Colors.white,
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#EFEFEF',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  priceInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: '#E8ECF4',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.black,
    backgroundColor: '#FAFAFB',
  },
  sendBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  presetChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  presetChipText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: Colors.black,
  },
});
