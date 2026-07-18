import React, { Fragment } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts } from '../../font';
import type { Ride } from '../providers/DriverProvider';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_MAX_H = Math.min(SCREEN_H * 0.9, 680);

// Charte Kêkênon — même langage que le modal « Suivi de consommation » côté client :
// sheet quasi-noir, accents dorés, CTA jaune texte noir.
const SHEET_BG = 'rgba(10, 10, 10, 0.98)';
const GOLD = '#F5C034';
const YELLOW = '#FDD835';
const GREEN = '#37BD6B';
const INK = '#1A1A1A';
const CARD_LINE = 'rgba(255, 255, 255, 0.08)';
const MUTED = 'rgba(255, 255, 255, 0.55)';

export type DriverOffersBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  offers: Ride[];
  driverName: string;
  getDistanceToPickup: (pickupLat?: number, pickupLon?: number) => string | null;
  getOfferTimerProgress: (offerId: string) => number;
  onAccept: (rideId: string) => void | Promise<void>;
};

export function DriverOffersBottomSheet({
  visible,
  onClose,
  offers,
  driverName,
  getDistanceToPickup,
  getOfferTimerProgress,
  onAccept,
}: DriverOffersBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const hasOffers = offers.length > 0;

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
            <View style={styles.sheetTitleBlock}>
              <Text style={styles.sheetKicker}>Demandes</Text>
              <Text style={styles.sheetTitle}>
                {offers.length === 1 ? 'Nouvelle course' : `${offers.length} courses`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fermer la liste des offres"
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {offers.length === 1 ? (
            <Text style={styles.sheetSubtitle} numberOfLines={1}>
              {driverName}, répondez vite pour garder la priorité.
            </Text>
          ) : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={offers.length > 1}
          >
            {offers.map((offer, index) => {
              const dist = getDistanceToPickup(offer.pickupLat, offer.pickupLon);
              const isLivraison = offer.service_type === 'livraison';
              const isNegotiable = offer.pricing_mode === 'negotiable';
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

                  <View style={styles.offerCard} accessible accessibilityLabel={offerA11y}>
                    {/* Fenêtre d'acceptation — fine barre dorée */}
                    <View style={styles.timerRow}>
                      <Ionicons name="time-outline" size={13} color={MUTED} />
                      <View style={styles.timerTrack}>
                        <LinearGradient
                          colors={[GOLD, YELLOW]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.timerFill, { width: `${Math.max(4, progress * 100)}%` }]}
                        />
                      </View>
                    </View>

                    {/* Héro : montant (ou négociation) + chips type / distance */}
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
                        {dist ? (
                          <View style={styles.chip}>
                            <Ionicons name="navigate" size={12} color={GOLD} />
                            <Text style={styles.chipText}>à {dist} km</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.fareRow}>
                        <Text style={styles.fareAmount}>{offer.fare.toLocaleString('fr-FR')}</Text>
                        <Text style={styles.fareCurrency}>FCFA</Text>
                      </View>
                      {isNegotiable ? (
                        <Text style={styles.negotiationHint}>Prix indicatif — à convenir au téléphone</Text>
                      ) : null}
                    </View>

                    {/* Trajet compact : une ligne par étape */}
                    <View style={styles.routeBlock}>
                      <View style={styles.routeRow}>
                        <View style={[styles.dot, { backgroundColor: GREEN }]} />
                        <Text style={styles.routeAddr} numberOfLines={1}>{offer.pickup}</Text>
                      </View>
                      <View style={styles.routeLink} />
                      <View style={styles.routeRow}>
                        <View style={[styles.dot, { backgroundColor: GOLD }]} />
                        <Text style={styles.routeAddr} numberOfLines={1}>{offer.dropoff}</Text>
                      </View>
                    </View>

                    {/* Passager */}
                    <View style={styles.riderRow}>
                      <View style={styles.riderAvatar}>
                        <Ionicons name="person" size={15} color={GOLD} />
                      </View>
                      <Text style={styles.riderName} numberOfLines={1}>{riderLabel}</Text>
                      {isNegotiable ? (
                        <View style={styles.negoTag}>
                          <Ionicons name="chatbubbles" size={12} color={GOLD} />
                          <Text style={styles.negoTagText}>À négocier</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* CTA — jaune Kêkênon, texte noir. On revendique la course ;
                        la négociation (le cas échéant) se fait au téléphone ensuite. */}
                    <TouchableOpacity
                      style={styles.btnAccept}
                      onPress={() => void onAccept(offer.id)}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={`Accepter la course${isNegotiable ? ' à négocier' : ` pour ${offer.fare.toLocaleString('fr-FR')} francs`}`}
                    >
                      <Ionicons name="checkmark-circle" size={20} color={INK} />
                      <Text style={styles.btnAcceptText}>Accepter la course</Text>
                    </TouchableOpacity>
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 18,
    paddingTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.3,
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
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sheetTitleBlock: {
    flex: 1,
  },
  sheetKicker: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: GOLD,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: 21,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: MUTED,
    marginTop: 4,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CARD_LINE,
  },
  scroll: {
    marginTop: 12,
    maxHeight: SHEET_MAX_H - 132,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  betweenOffers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 14,
  },
  betweenLine: {
    flex: 1,
    height: 1,
    backgroundColor: CARD_LINE,
  },
  betweenText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: MUTED,
    textTransform: 'uppercase',
  },
  offerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: CARD_LINE,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  timerTrack: {
    flex: 1,
    height: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    borderRadius: 100,
  },
  fareHero: {
    backgroundColor: 'rgba(245, 192, 52, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 192, 52, 0.25)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  fareAmount: {
    fontFamily: Fonts.bold,
    fontSize: 34,
    color: GOLD,
    letterSpacing: -1,
  },
  fareCurrency: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: GOLD,
    opacity: 0.75,
  },
  negotiationHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
  },
  routeBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_LINE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLink: {
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginLeft: 4,
    marginVertical: 2,
  },
  routeAddr: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: '#FFFFFF',
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  riderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(245, 192, 52, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderName: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  negoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(245, 192, 52, 0.15)',
  },
  negoTagText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: GOLD,
  },
  btnAccept: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 14,
  },
  btnAcceptText: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: INK,
  },
});
