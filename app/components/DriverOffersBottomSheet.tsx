import React, { Fragment, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Shadows } from '../../theme';
import { Fonts } from '../../font';
import type { Ride } from '../providers/DriverProvider';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_MAX_H = Math.min(SCREEN_H * 0.9, 680);

const SHEET_BG = '#EEF2FA';
const CARD_BG = '#FFFFFF';
const MUTED_LINE = '#E2E8F0';
const ROUTE_PANEL = '#F4F7FD';

export type DriverOffersBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  offers: Ride[];
  driverName: string;
  getDistanceToPickup: (pickupLat?: number, pickupLng?: number) => string | null;
  getOfferTimerProgress: (offerId: string) => number;
  onAccept: (rideId: string) => void | Promise<void>;
  onDetails: (rideId: string) => void;
  onBid?: (rideId: string, fare: number) => void | Promise<void>;
};

export function DriverOffersBottomSheet({
  visible,
  onClose,
  offers,
  driverName,
  getDistanceToPickup,
  getOfferTimerProgress,
  onAccept,
  onDetails,
  onBid,
}: DriverOffersBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const hasOffers = offers.length > 0;
  const [proposedFares, setProposedFares] = useState<Record<string, number>>({});


  if (!hasOffers) {
    return null;
  }

  return (
    <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
        accessibilityViewIsModal
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />

          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20), maxHeight: SHEET_MAX_H }]}>
            <View style={styles.handleWrap} accessibilityElementsHidden>
              <View style={styles.handle} />
            </View>

            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <LinearGradient
                  colors={[`${Colors.primary}18`, `${Colors.primary}08`]}
                  style={styles.sheetIconRing}
                >
                  <Ionicons name="radio-outline" size={22} color={Colors.primary} />
                </LinearGradient>
                <View style={styles.sheetTitleBlock}>
                  <Text style={styles.sheetKicker}>Demandes</Text>
                  <Text style={styles.sheetTitle}>
                    {offers.length === 1 ? 'Nouvelle course' : `${offers.length} courses`}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Fermer la liste des offres"
              >
                <Ionicons name="close" size={20} color={Colors.primaryDark} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSubtitle} numberOfLines={2}>
              {offers.length === 1
                ? `${driverName}, répondez vite pour garder la priorité.`
                : 'Faites défiler pour comparer les trajets.'}
            </Text>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              bounces={offers.length > 1}
            >
              {offers.map((offer, index) => {
                const dist = getDistanceToPickup(offer.pickupLat, offer.pickupLon);
                const isLivraison = offer.service_type === 'livraison';
                const progress = getOfferTimerProgress(offer.id);
                const riderLabel = offer.riderName || offer.riderPhone || 'Passager';
                const offerA11y = `${isLivraison ? 'Livraison' : 'Course'}, ${offer.fare.toLocaleString('fr-FR')} F, départ ${offer.pickup}`;

                return (
                  <Fragment key={offer.id}>
                    {index > 0 ? (
                      <View style={styles.betweenOffers}>
                        <View style={styles.betweenLine} />
                        <Text style={styles.betweenText}>Autre demande</Text>
                        <View style={styles.betweenLine} />
                      </View>
                    ) : null}

                    <View style={[styles.offerCard, Shadows.md]} accessible accessibilityLabel={offerA11y}>
                      <View style={styles.timerSection}>
                        <View style={styles.timerLabelRow}>
                          <Ionicons name="time-outline" size={14} color={Colors.mediumGray} />
                          <Text style={styles.timerLabel}>Fenêtre d’acceptation</Text>
                        </View>
                        <View style={styles.timerTrack}>
                          <LinearGradient
                            colors={[Colors.secondary, Colors.secondaryDark]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.timerFill, { width: `${Math.max(4, progress * 100)}%` }]}
                          />
                        </View>
                      </View>

                      <View style={styles.chipsRow}>
                        <View style={[styles.chip, isLivraison ? styles.chipLivraison : styles.chipCourse]}>
                          <Ionicons
                            name={isLivraison ? 'cube-outline' : 'car-sport-outline'}
                            size={15}
                            color={isLivraison ? '#6D28D9' : Colors.primary}
                          />
                          <Text style={[styles.chipText, isLivraison && styles.chipTextLivraison]}>
                            {isLivraison ? 'Livraison' : 'Course'}
                          </Text>
                        </View>
                        {dist ? (
                          <View style={styles.chipNeutral}>
                            <Ionicons name="navigate" size={14} color={Colors.primary} />
                            <Text style={styles.chipNeutralText}>{dist} km</Text>
                          </View>
                        ) : null}
                      </View>

                      {offer.pricing_mode === 'negotiable' ? (
                        <View style={styles.negotiationContainer}>
                          <Text style={styles.negotiationTitle}>Prix à débattre (Recommandé : {offer.fare} F)</Text>
                          <View style={styles.negotiationRow}>
                            <TouchableOpacity
                              style={styles.negotiationBtn}
                              onPress={() => {
                                setProposedFares(prev => {
                                  const current = prev[offer.id] ?? offer.fare;
                                  return { ...prev, [offer.id]: Math.max(100, current - 100) };
                                });
                              }}
                            >
                              <Ionicons name="remove-circle-outline" size={32} color={Colors.primary} />
                            </TouchableOpacity>
                            <Text style={styles.negotiationValue}>
                              {(proposedFares[offer.id] ?? offer.fare).toLocaleString('fr-FR')} FCFA
                            </Text>
                            <TouchableOpacity
                              style={styles.negotiationBtn}
                              onPress={() => {
                                setProposedFares(prev => {
                                  const current = prev[offer.id] ?? offer.fare;
                                  return { ...prev, [offer.id]: current + 100 };
                                });
                              }}
                            >
                              <Ionicons name="add-circle-outline" size={32} color={Colors.primary} />
                            </TouchableOpacity>
                          </View>
                          <View style={styles.presetsRow}>
                            {[100, 200, 500].map((preset) => (
                              <TouchableOpacity
                                key={preset}
                                style={styles.presetChip}
                                onPress={() => {
                                  setProposedFares(prev => {
                                    const current = prev[offer.id] ?? offer.fare;
                                    return { ...prev, [offer.id]: current + preset };
                                  });
                                }}
                              >
                                <Text style={styles.presetChipText}>+{preset} F</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      ) : (
                        <LinearGradient
                          colors={['#FFFFFF', '#F8FAFF']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.farePanel}
                        >
                          <Text style={styles.fareHint}>Montant de la course</Text>
                          <View style={styles.fareRow}>
                            <Text style={styles.fareAmount}>{offer.fare.toLocaleString('fr-FR')}</Text>
                            <Text style={styles.fareCurrency}>FCFA</Text>
                          </View>
                        </LinearGradient>
                      )}

                      <View style={styles.riderCard}>
                        <LinearGradient colors={Gradients.primary as [string, string]} style={styles.riderAvatar}>
                          <Ionicons name="person" size={20} color="white" />
                        </LinearGradient>
                        <View style={styles.riderTextCol}>
                          <Text style={styles.riderLabel}>Passager</Text>
                          <Text style={styles.riderName} numberOfLines={1}>
                            {riderLabel}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={Colors.mediumGray} />
                      </View>

                      <View style={styles.routePanel}>
                        <View style={styles.routePanelHeader}>
                          <Ionicons name="map-outline" size={16} color={Colors.primary} />
                          <Text style={styles.routePanelTitle}>Itinéraire</Text>
                        </View>
                        <View style={styles.routeInner}>
                          <View style={styles.routeTimeline}>
                            <View style={styles.timelineDotOuter}>
                              <View style={styles.timelineDotInner} />
                            </View>
                            <LinearGradient
                              colors={[MUTED_LINE, `${Colors.primary}40`]}
                              style={styles.timelineBar}
                            />
                            <View style={[styles.timelineDotOuter, styles.timelineDotOuterEnd]}>
                              <View style={styles.timelineDotEnd} />
                            </View>
                          </View>
                          <View style={styles.routeCopy}>
                            <View>
                              <Text style={styles.routeTag}>Départ</Text>
                              <Text style={styles.routeAddr} numberOfLines={2}>
                                {offer.pickup}
                              </Text>
                            </View>
                            <View style={styles.routeGap}>
                              <Text style={styles.routeTag}>Arrivée</Text>
                              <Text style={styles.routeAddr} numberOfLines={2}>
                                {offer.dropoff}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={styles.btnGhost}
                          onPress={() => onDetails(offer.id)}
                          activeOpacity={0.88}
                          accessibilityRole="button"
                          accessibilityLabel="Voir les détails de la course"
                        >
                          <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
                          <Text style={styles.btnGhostText}>Détails</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.btnPrimaryWrap}
                          onPress={() => {
                            if (offer.pricing_mode === 'negotiable' && onBid) {
                              const fare = proposedFares[offer.id] ?? offer.fare;
                              void onBid(offer.id, fare);
                            } else {
                              void onAccept(offer.id);
                            }
                          }}
                          activeOpacity={0.92}
                          accessibilityRole="button"
                          accessibilityLabel={
                            offer.pricing_mode === 'negotiable'
                              ? "Proposer mon offre"
                              : `Accepter pour ${offer.fare.toLocaleString('fr-FR')} francs`
                          }
                        >
                          <LinearGradient
                            colors={[Colors.secondary, Colors.secondaryDark]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.btnPrimary}
                          >
                            <Ionicons name={offer.pricing_mode === 'negotiable' ? 'send' : 'checkmark-circle'} size={21} color="white" />
                            <Text style={styles.btnPrimaryText}>
                              {offer.pricing_mode === 'negotiable' ? 'Proposer' : 'Accepter'}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Fragment>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 4,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 28 },
    }),
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(54, 80, 208, 0.22)',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sheetTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sheetIconRing: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitleBlock: {
    flex: 1,
  },
  sheetKicker: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.primary,
    textTransform: 'uppercase',
    opacity: 0.85,
    marginBottom: 2,
  },
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: 21,
    color: Colors.black,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
    marginBottom: 18,
    paddingRight: 44,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: MUTED_LINE,
  },
  scroll: {
    maxHeight: SHEET_MAX_H - 168,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  betweenOffers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 18,
  },
  betweenLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(54, 80, 208, 0.12)',
  },
  betweenText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.mediumGray,
    textTransform: 'uppercase',
  },
  offerCard: {
    backgroundColor: CARD_BG,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
  },
  timerSection: {
    marginBottom: 16,
  },
  timerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  timerLabel: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.mediumGray,
  },
  timerTrack: {
    height: 6,
    borderRadius: 100,
    backgroundColor: '#E8ECF5',
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    borderRadius: 100,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipCourse: {
    backgroundColor: `${Colors.primary}0D`,
    borderColor: `${Colors.primary}22`,
  },
  chipLivraison: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  chipText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.primaryDark,
  },
  chipTextLivraison: {
    color: '#5B21B6',
  },
  chipNeutral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: ROUTE_PANEL,
    borderWidth: 1,
    borderColor: MUTED_LINE,
  },
  chipNeutralText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.primaryDark,
  },
  farePanel: {
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${Colors.primary}12`,
  },
  fareHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.gray,
    marginBottom: 4,
  },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  fareAmount: {
    fontFamily: Fonts.bold,
    fontSize: 34,
    color: Colors.primaryDark,
    letterSpacing: -1,
  },
  fareCurrency: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.primary,
    opacity: 0.75,
    marginBottom: 2,
  },
  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: ROUTE_PANEL,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.85)',
  },
  riderAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderTextCol: {
    flex: 1,
  },
  riderLabel: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: Colors.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  riderName: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.black,
  },
  routePanel: {
    backgroundColor: ROUTE_PANEL,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
  },
  routePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  routePanelTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.primaryDark,
  },
  routeInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeTimeline: {
    width: 24,
    alignItems: 'center',
    marginRight: 4,
    paddingTop: 4,
  },
  timelineDotOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: `${Colors.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotOuterEnd: {
    backgroundColor: `${Colors.success}22`,
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  timelineBar: {
    width: 3,
    height: 52,
    marginVertical: 6,
    borderRadius: 2,
  },
  timelineDotEnd: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  routeCopy: {
    flex: 1,
    paddingLeft: 4,
  },
  routeTag: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 4,
    opacity: 0.9,
  },
  routeGap: {
    marginTop: 16,
  },
  routeAddr: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.black,
    lineHeight: 22,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1.5,
    borderColor: `${Colors.primary}35`,
  },
  btnGhostText: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.primary,
  },
  btnPrimaryWrap: {
    flex: 1.15,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: Colors.secondaryDark,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  btnPrimaryText: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: 'white',
  },
  negotiationContainer: {
    backgroundColor: '#F8FAFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    marginBottom: 16,
  },
  negotiationTitle: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 8,
  },
  negotiationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 10,
  },
  negotiationBtn: {
    padding: 4,
  },
  negotiationValue: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    color: Colors.black,
    minWidth: 110,
    textAlign: 'center',
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  presetChip: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  presetChipText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: Colors.primaryDark,
  },
});
