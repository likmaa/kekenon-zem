import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MOMO_PROVIDERS, MomoProvider, isValidBeninPhone } from '../constants/momo';
import { Colors } from '../../theme';
import { Fonts } from '../../font';

type Props = {
  visible: boolean;
  amount: number;
  busy?: boolean;
  defaultPhone?: string;
  title?: string;
  onClose: () => void;
  onSubmit: (phone: string, provider: MomoProvider) => void;
};

export default function MomoPaymentModal({
  visible,
  amount,
  busy = false,
  defaultPhone,
  title = 'Paiement Mobile Money',
  onClose,
  onSubmit,
}: Props) {
  const [provider, setProvider] = useState<MomoProvider>('MTN_MOMO_BEN');
  const [phone, setPhone] = useState(defaultPhone ?? '');

  React.useEffect(() => {
    if (visible && defaultPhone) setPhone((previous) => previous || defaultPhone);
  }, [visible, defaultPhone]);

  const phoneValid = isValidBeninPhone(phone);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={10}>
              <Ionicons name="close" size={22} color={Colors.gray} />
            </TouchableOpacity>
          </View>

          <Text style={styles.amount}>{amount.toLocaleString('fr-FR')} FCFA</Text>

          <Text style={styles.label}>Opérateur</Text>
          <View style={styles.providers}>
            {MOMO_PROVIDERS.map((item) => {
              const active = provider === item.value;
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.providerCard, active && styles.providerCardActive]}
                  onPress={() => setProvider(item.value)}
                  activeOpacity={0.85}
                  disabled={busy}
                >
                  <MaterialCommunityIcons
                    name="cellphone-check"
                    size={22}
                    color={active ? '#24914C' : Colors.gray}
                  />
                  <Text style={styles.providerLabel}>{item.label}</Text>
                  <Text style={styles.providerHint}>{item.hint}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Numéro Mobile Money</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Ex. 61 00 00 00"
            placeholderTextColor={Colors.gray}
            style={styles.input}
            selectionColor="#279C52"
            editable={!busy}
          />

          <TouchableOpacity
            style={[styles.submitBtn, (!phoneValid || busy) && styles.submitBtnDisabled]}
            disabled={!phoneValid || busy}
            onPress={() => onSubmit(phone.trim(), provider)}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Envoyer l’invite de paiement</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.note}>
            Vous recevrez une demande sur votre téléphone. Validez-la pour finaliser le paiement.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: Colors.white,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginBottom: 14,
    borderRadius: 2,
    backgroundColor: Colors.lightGray,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: Fonts.bold, fontSize: 17, color: Colors.black },
  amount: { marginTop: 6, marginBottom: 14, fontFamily: Fonts.bold, fontSize: 28, color: '#24914C' },
  label: {
    marginBottom: 8,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: Colors.gray,
  },
  providers: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  providerCard: {
    flex: 1,
    gap: 2,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.lightGray,
  },
  providerCardActive: { borderColor: '#2BA458', backgroundColor: '#EAF7EE' },
  providerLabel: { marginTop: 4, fontFamily: Fonts.bold, fontSize: 14, color: Colors.black },
  providerHint: { fontFamily: Fonts.regular, fontSize: 11, color: Colors.gray },
  input: {
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: Colors.lightGray,
    borderRadius: 12,
    fontFamily: Fonts.medium,
    fontSize: 18,
    color: Colors.black,
  },
  submitBtn: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: '#2BA458',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontFamily: Fonts.bold, fontSize: 15, color: '#FFFFFF' },
  note: {
    marginTop: 12,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    color: Colors.gray,
  },
});
