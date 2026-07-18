import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme';
import { Fonts } from '../../font';

interface Props {
  visible: boolean;
  remainingRides: number;
  packPrice: number;
  packRides: number;
  onRecharge: () => void;
  onClose: () => void;
}

/**
 * Popup abonnement conducteur — l'abonnement se renouvelle AUTOMATIQUEMENT
 * depuis le portefeuille (solde puis bonus). Ce popup n'apparaît donc que
 * lorsque le zem ne peut plus couvrir le prix du pack configuré : il invite à recharger.
 */
export default function SubscriptionModal({ visible, remainingRides, packPrice, packRides, onRecharge, onClose }: Props) {
  const depleted = remainingRides <= 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Fermer">
            <Ionicons name="close" size={22} color={Colors.gray} />
          </TouchableOpacity>

          <View style={[styles.iconCircle, depleted ? styles.iconCircleAlert : styles.iconCircleWarn]}>
            <Ionicons
              name={depleted ? 'warning' : 'alert-circle'}
              size={30}
              color={depleted ? '#DC2626' : '#B45309'}
            />
          </View>

          <Text style={styles.title}>
            {depleted ? 'Compte à sec !' : `Plus que ${remainingRides} course${remainingRides > 1 ? 's' : ''}`}
          </Text>

          <Text style={styles.desc}>
            {depleted
              ? `Votre pack est épuisé et votre solde ne couvre pas les ${packPrice.toLocaleString('fr-FR')} F du renouvellement automatique (${packRides} courses). Rechargez pour continuer à rouler.`
              : `Votre pack arrive à sa fin. Rechargez au moins ${packPrice.toLocaleString('fr-FR')} F pour renouveler automatiquement ${packRides} courses.`}
          </Text>

          <TouchableOpacity style={styles.renewBtn} onPress={onRecharge} activeOpacity={0.85}>
            <Text style={styles.renewBtnText}>Recharger mon portefeuille</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.laterBtn}>
            <Text style={styles.laterText}>Plus tard</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  iconCircleAlert: { backgroundColor: '#FEE2E2' },
  iconCircleWarn: { backgroundColor: '#FEF3C7' },
  title: { fontFamily: Fonts.bold, fontSize: 19, color: Colors.black, textAlign: 'center', marginBottom: 8 },
  desc: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  renewBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  renewBtnText: { fontFamily: Fonts.bold, fontSize: 15, color: '#1A1A1A' },
  laterBtn: { paddingVertical: 12, marginTop: 4 },
  laterText: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.gray },
});
