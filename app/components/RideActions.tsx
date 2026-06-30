import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Fonts } from '../../font';

type Props = {
  onAccept: () => void;
  onDecline: () => void;
};

export function RideActions({ onAccept, onDecline }: Props) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 12, gap: 10 }}>
      <TouchableOpacity
        style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' }}
        onPress={onDecline}
      >
        <Text style={{ fontFamily: Fonts.titilliumWebBold, color: '#111827' }}>Refuser</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center' }}
        onPress={onAccept}
      >
        <Text style={{ fontFamily: Fonts.titilliumWebBold, color: '#fff' }}>Accepter</Text>
      </TouchableOpacity>
    </View>
  );
}

