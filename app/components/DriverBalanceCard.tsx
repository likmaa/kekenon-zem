import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { Octicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts } from '../../font';

const SHEET_MIN_HEIGHT = Dimensions.get('window').height * 0.35; // ≥ 35% de l'écran

type Props = {
  balance: number;
  currency?: string;
  bonus?: number;
  onRecharge: () => void;
  /** Encoche safe-area (le sheet remonte sous la barre de statut). */
  topInset?: number;
  /** Contenu d'en-tête rendu au-dessus du solde (menu, avatar, notifications). */
  header?: React.ReactNode;
};

/**
 * Top sheet solde conducteur — dégradé vert Kêkênon, plein largeur, coins bas
 * arrondis. Embarque l'en-tête (header) et la carte solde (masquable, Recharger,
 * bonus) dans un seul bloc, comme la maquette.
 */
export default function DriverBalanceCard({
  balance,
  currency = 'FCFA',
  bonus,
  onRecharge,
  topInset = 0,
  header,
}: Props) {
  const [hidden, setHidden] = useState(true);

  return (
    <LinearGradient
      colors={['#37BD6B', '#29A356']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.sheet, { paddingTop: topInset + 14, minHeight: SHEET_MIN_HEIGHT }]}
    >
      <Image
        source={require('../../assets/images/logo_cabin.png')}
        style={styles.watermark}
        resizeMode="contain"
      />

      {header ? <View style={styles.headerSlot}>{header}</View> : null}

      {/* Pousse le solde vers le bas du sheet */}
      <View style={styles.spacer} />

      <View style={styles.labelRow}>
        <Text style={styles.label}>Solde disponible</Text>
        <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10} style={{ marginLeft: 8 }}>
          <Octicons name={hidden ? 'eye-closed' : 'eye'} size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.balanceRow}>
        <Text style={styles.balance} numberOfLines={1} adjustsFontSizeToFit>
          {hidden ? '••••' : Number(balance || 0).toLocaleString('fr-FR')} {currency}
        </Text>

        <TouchableOpacity style={styles.rechargeBtn} onPress={onRecharge} activeOpacity={0.85}>
          <Octicons name="plus" size={18} color="#1A1A1A" />
          <Text style={styles.rechargeText}>Recharger</Text>
        </TouchableOpacity>
      </View>

      {bonus && bonus > 0 ? (
        <View style={styles.bonusBadge}>
          <View style={styles.bonusTag}>
            <Text style={styles.bonusTagText}>BONUS</Text>
          </View>
          <Text style={styles.bonusAmount}>{bonus.toLocaleString('fr-FR')}f CFA</Text>
          <View style={{ flex: 1 }} />
          <Octicons name="gift" size={18} color="rgba(255,255,255,0.9)" style={{ marginRight: 4 }} />
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -20,
    bottom: -20,
    width: 180,
    height: 180,
    opacity: 0.12,
    tintColor: '#FFFFFF',
  },
  headerSlot: { marginBottom: 14 },
  spacer: { flex: 1, minHeight: 20 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  label: { fontFamily: Fonts.medium, color: '#FFFFFF', fontSize: 15, opacity: 0.9 },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  balance: { fontFamily: Fonts.bold, fontSize: 40, color: '#FFFFFF', flexShrink: 1, marginRight: 12 },
  rechargeBtn: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  rechargeText: { fontFamily: Fonts.bold, color: '#1A1A1A', fontSize: 14, marginLeft: 4 },
  bonusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch', // pleine largeur
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    overflow: 'hidden',
    paddingRight: 16,
  },
  bonusTag: { backgroundColor: '#FDD835', paddingHorizontal: 16, paddingVertical: 11, marginRight: 12 },
  bonusTagText: { fontFamily: Fonts.bold, fontSize: 13, color: '#1A1A1A' },
  bonusAmount: { fontFamily: Fonts.bold, fontSize: 17, color: '#FFFFFF' },
});
