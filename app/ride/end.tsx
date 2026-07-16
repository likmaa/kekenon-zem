import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';

import { Colors } from '../../theme';
import { Fonts } from '../../font';
import { apiFetch } from '../utils/apiClient';
import { getPusherClient, unsubscribeChannel } from '../services/pusherClient';
import { getAuthToken, removeAuthToken } from '../utils/authTokenStorage';

export default function EndRideScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Use a ref for rideId to avoid dependency issues if it somehow changes
  const rideId = params.rideId as string;
  const paymentLink = params.paymentLink as string;

  const [fare, setFare] = useState<number>(params.fare ? Number(params.fare) : 0);
  const [tip, setTip] = useState<number>(0);
  const [rating, setRating] = useState<number>(5.0);
  const [loading, setLoading] = useState<boolean>(true);

  const isMounted = useRef(true);

  const fetchRideDetails = useCallback(async (id: string) => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      const token = await getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await apiFetch(`/driver/rides/${id}`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (res?.ok) {
        const json = await res.json();
        if (json && isMounted.current) {
          // Priority to fare_amount from server, then breakdown total_fare
          const finalFare = json.fare_amount ?? json.total_fare ?? 0;
          setFare(Number(finalFare));
          setTip(Number(json.tip_amount ?? 0));
          if (json.rating !== undefined && json.rating !== null) {
            setRating(Number(json.rating));
          }
        }
      } else {
        console.warn(`[EndRide] Fetch failed with status: ${res?.status}`);
      }
    } catch (err) {
      console.error('[EndRide] fetchRideDetails error:', err);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    let channel: any = null;

    if (rideId) {
      fetchRideDetails(rideId);

      // Pusher Setup
      (async () => {
        try {
          const client = await getPusherClient();
          channel = client.subscribe(`private-ride.${rideId}`);

          channel.bind('ride.rated', (data: { tip_amount?: number, rating?: number }) => {
            if (!isMounted.current) return;
            console.log('[EndRide] Real-time rating received:', data);
            if (data.tip_amount !== undefined) setTip(Number(data.tip_amount));
            if (data.rating !== undefined) setRating(Number(data.rating));
          });

          channel.bind('payment.confirmed', (data: any) => {
            if (!isMounted.current) return;
            console.log('[EndRide] Payment confirmed:', data);
            Alert.alert(
              "Paiement Reçu !",
              `Le paiement de ${data.amount} FCFA a été confirmé avec succès.`,
              [{ text: "OK" }]
            );
          });
        } catch (e) {
          console.warn('[EndRide] Pusher init failed:', e);
        }
      })();
    } else {
      setLoading(false);
    }

    return () => {
      isMounted.current = false;
      if (channel) {
        unsubscribeChannel(channel);
      }
    };
  }, [rideId, fetchRideDetails]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Calcul du reçu final...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.successHeader}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark" size={48} color={Colors.white} />
          </View>
          <Text style={styles.mainTitle}>Course terminée !</Text>
          <Text style={styles.subTitle}>Merci pour votre excellent service.</Text>
        </View>

        {paymentLink && (
          <View style={[styles.receiptCard, { alignItems: 'center', marginBottom: 20 }]}>
            <Text style={[styles.receiptLabel, { marginBottom: 15 }]}>SCANNER POUR PAYER</Text>
            <QRCode value={paymentLink} size={180} />
            <Text style={[styles.subTitle, { marginTop: 10, fontSize: 13 }]}>Demandez au client de scanner ce QR</Text>
          </View>
        )}

        <View style={styles.receiptCard}>
          <View style={styles.receiptTop}>
            <Text style={styles.receiptLabel}>MONTANT TOTAL PERÇU</Text>
            <Text style={styles.amountValue}>
              {fare.toLocaleString('fr-FR')} FCFA
            </Text>
          </View>

          <View style={styles.receiptDivider} />

          <View style={styles.detailsGrid}>
            <View style={styles.detailBox}>
              <View style={[styles.iconBox, { backgroundColor: '#FEF3C7' }]}>
                <MaterialCommunityIcons name="hand-coin" size={20} color="#D97706" />
              </View>
              <Text style={styles.detailLabel}>Pourboire</Text>
              <Text style={styles.detailValue}>{tip > 0 ? `${tip} F` : '0 F'}</Text>
            </View>

            <View style={styles.verticalDivider} />

            <View style={styles.detailBox}>
              <View style={[styles.iconBox, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="star" size={18} color="#0EA5E9" />
              </View>
              <Text style={styles.detailLabel}>Note</Text>
              <Text style={styles.detailValue}>{rating > 0 ? rating.toFixed(1) : '5.0'}</Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.gray} />
            <Text style={styles.infoText}>Le pourboire est crédité instantanément sur votre portefeuille.</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            // Clear entire navigation stack to prevent loop
            while (router.canGoBack()) {
              router.back();
            }
            router.replace('/(tabs)');
          }}
        >
          <Text style={styles.primaryBtnText}>RETOUR À L'ACCUEIL</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.white} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 20,
    fontFamily: Fonts.regular,
    color: Colors.gray,
  },
  content: {
    padding: 24,
    alignItems: 'center',
    paddingTop: 60,
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  mainTitle: {
    fontSize: 26,
    fontFamily: Fonts.bold,
    color: Colors.black,
    textAlign: 'center',
  },
  subTitle: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 8,
  },
  receiptCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 30,
  },
  receiptTop: {
    alignItems: 'center',
    marginBottom: 20,
  },
  receiptLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.gray,
    letterSpacing: 1,
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 34,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 20,
    borderStyle: 'dashed',
    borderRadius: 1,
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
  },
  detailBox: {
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.gray,
  },
  detailValue: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: Colors.black,
    marginTop: 2,
  },
  verticalDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  infoText: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: Colors.gray,
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: Colors.black,
    width: '100%',
    borderRadius: 16,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    elevation: 2,
  },
  primaryBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
  },
});
