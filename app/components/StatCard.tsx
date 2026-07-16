import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '../../theme';
import { Fonts } from '../../font';

interface StatCardProps {
    icon: keyof typeof Ionicons.glyphMap;
    value: string | number;
    label: string;
    /** Sous-texte (ex. précision sur un libellé ambigu) */
    subtitle?: string;
    color?: string;
}

export function StatCard({ icon, value, label, subtitle, color = Colors.primary }: StatCardProps) {
    return (
        <View style={[styles.statCard, Shadows.md]}>
            <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
                <Ionicons name={icon} size={22} color={color} />
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
                {subtitle ? <Text style={styles.statSubtitle}>{subtitle}</Text> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    statCard: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 128,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    textContainer: {
        alignItems: 'center',
    },
    statValue: {
        fontFamily: Fonts.bold,
        fontSize: 20,
        color: Colors.black,
        marginBottom: 2,
    },
    statLabel: {
        fontFamily: Fonts.regular,
        fontSize: 12,
        color: Colors.gray,
        textAlign: 'center',
        lineHeight: 14,
    },
    statSubtitle: {
        fontFamily: Fonts.regular,
        fontSize: 10,
        color: Colors.gray,
        textAlign: 'center',
        marginTop: 4,
        lineHeight: 12,
        opacity: 0.85,
    },
});
