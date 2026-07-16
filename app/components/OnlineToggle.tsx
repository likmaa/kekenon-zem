import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows, Gradients } from '../../theme';
import { Fonts } from '../../font';
import { LinearGradient } from 'expo-linear-gradient';

interface OnlineToggleProps {
    isOnline: boolean;
    onToggle: () => void;
    loading?: boolean;
}

export function OnlineToggle({ isOnline, onToggle, loading = false }: OnlineToggleProps) {
    return (
        <TouchableOpacity
            onPress={onToggle}
            activeOpacity={0.9}
            disabled={loading}
            style={Shadows.lg}
            accessibilityRole="switch"
            accessibilityState={{ checked: isOnline, busy: loading }}
            accessibilityLabel={isOnline ? 'Statut : en ligne' : 'Statut : hors ligne'}
            accessibilityHint={
                isOnline
                    ? 'Appuyez pour passer hors ligne et ne plus recevoir de courses'
                    : 'Appuyez pour passer en ligne et recevoir des demandes'
            }
        >
            <LinearGradient
                colors={isOnline ? Gradients.success : Gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.toggleButton}
            >
                <View style={styles.iconWrapper}>
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Ionicons
                            name={isOnline ? "shield-checkmark" : "power"}
                            size={24}
                            color="white"
                        />
                    )}
                    {isOnline && <View style={styles.pulseIndicator} />}
                </View>

                <View style={styles.textContainer}>
                    <Text style={styles.statusText}>
                        {isOnline ? "EN LIGNE" : "HORS LIGNE"}
                    </Text>
                    <Text style={styles.actionText}>
                        {isOnline ? "Prêt pour une commande" : "Passer en ligne pour recevoir"}
                    </Text>
                </View>

                <View style={styles.switchTrack}>
                    <View style={[
                        styles.switchThumb,
                        isOnline && styles.switchThumbOnline
                    ]} />
                </View>
            </LinearGradient>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    toggleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 24,
        padding: 18,
        gap: 16,
    },
    iconWrapper: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    pulseIndicator: {
        position: 'absolute',
        top: 2,
        right: 2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#4ADE80',
        borderWidth: 2,
        borderColor: 'white',
    },
    textContainer: {
        flex: 1,
    },
    statusText: {
        fontFamily: Fonts.bold,
        fontSize: 18,
        color: 'white',
        letterSpacing: 1,
    },
    actionText: {
        fontFamily: Fonts.regular,
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    switchTrack: {
        width: 48,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        padding: 2,
    },
    switchThumb: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'white',
    },
    switchThumbOnline: {
        transform: [{ translateX: 24 }],
    },
});
