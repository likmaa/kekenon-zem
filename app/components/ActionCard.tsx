import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows, Gradients } from '../../theme';
import { Fonts } from '../../font';
import { LinearGradient } from 'expo-linear-gradient';

interface ActionCardProps {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    fullWidth?: boolean;
    value?: string | number;
    isWallet?: boolean;
    accessibilityLabel?: string;
    accessibilityHint?: string;
}

export function ActionCard({
    icon,
    label,
    onPress,
    fullWidth = false,
    value,
    isWallet = false,
    accessibilityLabel,
    accessibilityHint,
}: ActionCardProps) {
    const gradientColors = isWallet ? Gradients.wallet : Gradients.glass;
    const textColor = isWallet ? Colors.white : Colors.black;
    const labelColor = isWallet ? 'rgba(255, 255, 255, 0.8)' : Colors.gray;
    const iconColor = isWallet ? Colors.white : Colors.primary;
    const chevronColor = isWallet ? 'rgba(255, 255, 255, 0.5)' : Colors.border;
    const shadowStyle = isWallet ? Shadows.md : {};

    const a11yLabel = accessibilityLabel ?? (value !== undefined ? `${label}, ${value}` : label);

    return (
        <TouchableOpacity
            style={[styles.container, fullWidth && styles.fullWidth, isWallet && { shadowColor: '#E65100', shadowOpacity: 0.3 }]}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityHint={accessibilityHint}
        >
            <LinearGradient
                colors={gradientColors as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.actionCard, shadowStyle, isWallet && styles.walletCard]}
            >
                {isWallet && (
                    <>
                        <View style={styles.coinDecor1} />
                        <View style={styles.coinDecor2} />
                        <View style={styles.coinDecor3} />
                    </>
                )}
                <View style={[styles.iconContainer, isWallet && styles.walletIconContainer]}>
                    <Ionicons name={icon} size={18} color={iconColor} />
                </View>
                <View style={styles.contentContainer}>
                    <Text style={[styles.actionLabel, { color: labelColor }]}>{label}</Text>
                    {value !== undefined && (
                        <Text style={[styles.valueText, { color: textColor }]}>{value}</Text>
                    )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={chevronColor} />
            </LinearGradient>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    fullWidth: {
        flex: undefined,
        width: '100%',
    },
    actionCard: {
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        minHeight: 60,
        overflow: 'hidden',
    },
    walletCard: {
        borderWidth: 0,
        elevation: 8,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: `${Colors.primary}10`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    walletIconContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
        zIndex: 1,
    },
    actionLabel: {
        fontFamily: Fonts.regular,
        fontSize: 13,
        color: Colors.gray,
        marginBottom: 2,
    },
    valueText: {
        fontFamily: Fonts.bold,
        fontSize: 20,
        color: Colors.black,
    },
    coinDecor1: {
        position: 'absolute',
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.1)',
        top: -20,
        right: -10,
    },
    coinDecor2: {
        position: 'absolute',
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.08)',
        bottom: -15,
        right: 60,
    },
    coinDecor3: {
        position: 'absolute',
        width: 35,
        height: 35,
        borderRadius: 17.5,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        top: 5,
        right: 100,
    },
});
