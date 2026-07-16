import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme';
import { Fonts } from '../../font';

interface MonthlyEarningsModalProps {
    visible: boolean;
    onClose: () => void;
    monthlyEarnings: number;
    totalRevenue: number;
    completedRidesCount: number;
}

export function MonthlyEarningsModal({
    visible,
    onClose,
    monthlyEarnings,
    totalRevenue,
    completedRidesCount
}: MonthlyEarningsModalProps) {
    const currentMonth = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const commission = 20; // 20%

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Gains du mois</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={Colors.black} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Période */}
                        <View style={styles.periodContainer}>
                            <Ionicons name="calendar" size={20} color={Colors.primary} />
                            <Text style={styles.periodText}>{currentMonth}</Text>
                        </View>

                        {/* Montant principal */}
                        <View style={styles.mainAmountContainer}>
                            <Text style={styles.label}>Vos gains</Text>
                            <Text style={styles.mainAmount}>
                                {monthlyEarnings.toLocaleString('fr-FR')} <Text style={styles.currency}>FCFA</Text>
                            </Text>
                            <View style={styles.commissionBadge}>
                                <Text style={styles.commissionText}>{commission}% de commission</Text>
                            </View>
                        </View>

                        {/* Détails */}
                        <View style={styles.detailsContainer}>
                            <View style={styles.detailRow}>
                                <View style={styles.detailLeft}>
                                    <Ionicons name="cash-outline" size={20} color={Colors.gray} />
                                    <Text style={styles.detailLabel}>Revenus totaux</Text>
                                </View>
                                <Text style={styles.detailValue}>{totalRevenue.toLocaleString('fr-FR')} F</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLeft}>
                                    <Ionicons name="car-sport" size={20} color={Colors.gray} />
                                    <Text style={styles.detailLabel}>Courses terminées</Text>
                                </View>
                                <Text style={styles.detailValue}>{completedRidesCount}</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLeft}>
                                    <Ionicons name="trending-up" size={20} color={Colors.gray} />
                                    <Text style={styles.detailLabel}>Revenu moyen/course</Text>
                                </View>
                                <Text style={styles.detailValue}>
                                    {completedRidesCount > 0
                                        ? Math.round(totalRevenue / completedRidesCount).toLocaleString('fr-FR')
                                        : 0} F
                                </Text>
                            </View>
                        </View>

                        {/* Info */}
                        <View style={styles.infoContainer}>
                            <Ionicons name="information-circle" size={20} color={Colors.primary} />
                            <Text style={styles.infoText}>
                                Vous recevez {commission}% du montant total de chaque course terminée.
                            </Text>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: 'white',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingBottom: 40,
        paddingHorizontal: 20,
        maxHeight: '80%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontFamily: Fonts.bold,
        fontSize: 22,
        color: Colors.black,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    periodContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
    },
    periodText: {
        fontFamily: Fonts.regular,
        fontSize: 14,
        color: Colors.gray,
        textTransform: 'capitalize',
    },
    mainAmountContainer: {
        backgroundColor: '#F0F9FF',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    label: {
        fontFamily: Fonts.regular,
        fontSize: 14,
        color: Colors.gray,
        marginBottom: 8,
    },
    mainAmount: {
        fontFamily: Fonts.bold,
        fontSize: 36,
        color: Colors.primary,
        marginBottom: 12,
    },
    currency: {
        fontSize: 18,
        color: Colors.primary,
        opacity: 0.8,
    },
    commissionBadge: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
    },
    commissionText: {
        fontFamily: Fonts.bold,
        fontSize: 12,
        color: 'white',
    },
    detailsContainer: {
        gap: 16,
        marginBottom: 24,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    detailLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    detailLabel: {
        fontFamily: Fonts.regular,
        fontSize: 14,
        color: Colors.black,
    },
    detailValue: {
        fontFamily: Fonts.bold,
        fontSize: 15,
        color: Colors.black,
    },
    infoContainer: {
        flexDirection: 'row',
        gap: 12,
        backgroundColor: '#F0F9FF',
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 3,
        borderLeftColor: Colors.primary,
    },
    infoText: {
        flex: 1,
        fontFamily: Fonts.regular,
        fontSize: 13,
        color: Colors.gray,
        lineHeight: 18,
    },
});
