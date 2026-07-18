import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  ImageBackground,
  StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '../../theme';
import { Fonts } from '../../font';
import { apiFetch } from '../utils/apiClient';
import { getPusherClient, unsubscribeChannel } from '../services/pusherClient';
import { getAuthToken } from '../utils/authTokenStorage';

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

  return (
    <ImageBackground
      source={require('../../assets/images/amazone.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['rgba(8,8,8,0.42)', 'rgba(8,8,8,0.72)', 'rgba(8,8,8,0.96)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <View style={styles.loadingIcon}>
              <ActivityIndicator size="large" color={Colors.dark} />
            </View>
            <Text style={styles.loadingText}>Calcul du reçu final…</Text>
          </View>
        ) : (
          <View style={styles.screenContent}>
            <View style={styles.hero}>
              <View style={styles.successHeader}>
                <View style={styles.successBadge}>
                  <View style={styles.successIconCircle}>
                    <Ionicons name="checkmark" size={22} color={Colors.dark} />
                  </View>
                  <Text style={styles.successBadgeText}>Course terminée</Text>
                </View>
                <Text style={styles.mainTitle}>Bien joué !</Text>
                <Text style={styles.subTitle}>Le trajet est terminé. Voici votre reçu.</Text>
              </View>
            </View>

            <View style={styles.bottomPanel}>
              <ScrollView
                style={styles.panelScroll}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.receiptCard}>
                  <View style={styles.receiptHeading}>
                    <View style={styles.receiptHeadingIcon}>
                      <MaterialCommunityIcons name="wallet-outline" size={20} color={Colors.primary} />
                    </View>
                    <Text style={styles.receiptLabel}>Montant de la course</Text>
                  </View>
                  <Text style={styles.amountValue}>{fare.toLocaleString('fr-FR')} FCFA</Text>

                  <View style={styles.receiptDivider} />

                  <View style={styles.detailsGrid}>
                    <View style={styles.detailBox}>
                      <View style={styles.iconBox}>
                        <MaterialCommunityIcons name="hand-coin-outline" size={20} color={Colors.primary} />
                      </View>
                      <View>
                        <Text style={styles.detailLabel}>Pourboire</Text>
                        <Text style={styles.detailValue}>
                          {tip > 0 ? `${tip.toLocaleString('fr-FR')} F` : '0 F'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.verticalDivider} />

                    <View style={styles.detailBox}>
                      <View style={styles.iconBox}>
                        <Ionicons name="star" size={18} color={Colors.primary} />
                      </View>
                      <View>
                        <Text style={styles.detailLabel}>Note reçue</Text>
                        <Text style={styles.detailValue}>{rating > 0 ? rating.toFixed(1) : '5.0'}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                    <Text style={styles.infoText}>
                      Le pourboire est crédité instantanément sur votre portefeuille.
                    </Text>
                  </View>
                </View>

                {paymentLink ? (
                  <View style={styles.qrCard}>
                    <View style={styles.qrHeading}>
                      <View style={styles.qrIconBox}>
                        <MaterialCommunityIcons name="qrcode-scan" size={20} color={Colors.dark} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.qrTitle}>Paiement par QR code</Text>
                        <Text style={styles.qrSubtitle}>Présentez ce code au client.</Text>
                      </View>
                    </View>
                    <View style={styles.qrSurface}>
                      <QRCode value={paymentLink} size={156} />
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.actionContainer}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  activeOpacity={0.88}
                  onPress={() => {
                    while (router.canGoBack()) {
                      router.back();
                    }
                    router.replace('/(tabs)');
                  }}
                >
                  <Text style={styles.primaryBtnText}>Retour à l'accueil</Text>
                  <Ionicons name="arrow-forward" size={20} color={Colors.dark} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: Colors.dark,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  loadingText: {
    marginTop: 16,
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.white,
  },
  screenContent: {
    flex: 1,
  },
  hero: {
    flex: 0.31,
    minHeight: 180,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  bottomPanel: {
    flex: 0.69,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(10,10,10,0.96)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    elevation: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  panelScroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  successHeader: {
    alignItems: 'center',
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,10,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  successIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  successBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.white,
  },
  mainTitle: {
    marginTop: 16,
    fontFamily: Fonts.bold,
    fontSize: 34,
    lineHeight: 38,
    color: Colors.white,
    textAlign: 'center',
  },
  subTitle: {
    marginTop: 5,
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'center',
  },
  receiptCard: {
    width: '100%',
    padding: 20,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  receiptHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  receiptHeadingIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(253,216,53,0.12)',
  },
  receiptLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.62)',
  },
  amountValue: {
    marginTop: 16,
    fontFamily: Fonts.bold,
    fontSize: 38,
    lineHeight: 43,
    color: Colors.primary,
  },
  receiptDivider: {
    height: 1,
    marginVertical: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  detailsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  detailBox: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(253,216,53,0.11)',
  },
  detailLabel: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  detailValue: {
    marginTop: 1,
    fontFamily: Fonts.bold,
    fontSize: 17,
    color: Colors.white,
  },
  verticalDivider: {
    width: 1,
    height: 42,
    marginHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.58)',
  },
  qrCard: {
    width: '100%',
    marginTop: 14,
    padding: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  qrHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 14,
  },
  qrIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  qrTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.white,
  },
  qrSubtitle: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },
  qrSurface: {
    alignSelf: 'center',
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.white,
  },
  primaryBtn: {
    width: '100%',
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  actionContainer: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: 'rgba(10,10,10,0.98)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.dark,
  },
});
