import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DRIVER_BROADCAST_NOTIF_LAST_ACK_KEY } from './constants/driverBroadcastNotifications';
import { getAuthToken, removeAuthToken } from './utils/authTokenStorage';

export default function NotificationsScreen() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNotification, setSelectedNotification] = useState<any>(null);

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const token = await getAuthToken();
            if (!token || !getApiBaseUrl()) return;

            const response = await apiFetch('/driver/notifications', {
                headers: {
                    Accept: 'application/json',
                },
            });

            if (response?.ok) {
                const data = await response.json();
                setNotifications(data);
                await AsyncStorage.setItem(DRIVER_BROADCAST_NOTIF_LAST_ACK_KEY, new Date().toISOString());
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: { item: any }) => {
        let iconName: any = 'information';
        let iconColor = Colors.primary;
        let bgColor = '#E0F2FE'; // Light blue default

        const type = item.type || 'system';

        switch (type) {
            case 'system':
                iconName = 'information-outline';
                iconColor = Colors.primary;
                bgColor = '#E0F2FE';
                break;
            case 'promo':
                iconName = 'gift-outline';
                iconColor = '#F59E0B'; // Orange/Gold
                bgColor = '#FEF3C7';
                break;
            case 'alert':
                iconName = 'alert-circle-outline';
                iconColor = '#EF4444'; // Red
                bgColor = '#FEE2E2';
                break;
        }

        const date = new Date(item.created_at).toLocaleDateString('fr-FR');

        return (
            <TouchableOpacity
                style={[styles.notificationItem]}
                onPress={() => setSelectedNotification(item)}
            >
                <View style={[styles.iconContainer, { backgroundColor: bgColor }]}>
                    <Ionicons name={iconName} size={24} color={iconColor} />
                </View>
                <View style={styles.textContainer}>
                    <View style={styles.itemHeader}>
                        <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.itemTime}>{date}</Text>
                    </View>
                    <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color={Colors.black} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notifications</Text>
                <TouchableOpacity style={styles.readAllButton} onPress={fetchNotifications}>
                    <Ionicons name="refresh" size={24} color={Colors.primary} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="notifications-off-outline" size={64} color="#D1D5DB" />
                            <Text style={styles.emptyText}>Aucune notification pour le moment</Text>
                        </View>
                    }
                    refreshing={loading}
                    onRefresh={fetchNotifications}
                />
            )}

            {/* Modal Detail */}
            <Modal
                visible={!!selectedNotification}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedNotification(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Détails</Text>
                            <TouchableOpacity onPress={() => setSelectedNotification(null)}>
                                <Ionicons name="close" size={24} color={Colors.black} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalBody}>
                            {selectedNotification && (
                                <>
                                    <Text style={styles.detailTitle}>{selectedNotification.title}</Text>
                                    <Text style={styles.detailDate}>
                                        Reçu le {new Date(selectedNotification.created_at).toLocaleDateString('fr-FR')} à {new Date(selectedNotification.created_at).toLocaleTimeString('fr-FR')}
                                    </Text>
                                    <View style={styles.divider} />
                                    <Text style={styles.detailMessage}>{selectedNotification.message}</Text>
                                </>
                            )}
                        </ScrollView>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => setSelectedNotification(null)}
                        >
                            <Text style={styles.closeButtonText}>Fermer</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 10,
        backgroundColor: 'white',
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        fontFamily: Fonts.bold,
        fontSize: 18,
        color: Colors.black,
    },
    readAllButton: {
        padding: 8,
        marginRight: -8,
    },
    listContent: {
        padding: 20,
        paddingBottom: 40,
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    textContainer: {
        flex: 1,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    itemTitle: {
        fontFamily: Fonts.bold,
        fontSize: 16,
        color: Colors.black,
        flex: 1,
        marginRight: 8,
    },
    itemTime: {
        fontFamily: Fonts.regular,
        fontSize: 12,
        color: Colors.gray,
    },
    itemMessage: {
        fontFamily: Fonts.regular,
        fontSize: 14,
        color: '#4B5563',
        lineHeight: 20,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
    },
    emptyText: {
        fontFamily: Fonts.semiBold,
        fontSize: 16,
        color: Colors.gray,
        marginTop: 16,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 20,
        maxHeight: '80%',
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontFamily: Fonts.bold,
        fontSize: 20,
        color: Colors.black,
    },
    modalBody: {
        marginBottom: 20,
    },
    detailTitle: {
        fontFamily: Fonts.bold,
        fontSize: 18,
        color: Colors.black,
        marginBottom: 8,
    },
    detailDate: {
        fontFamily: Fonts.regular,
        fontSize: 14,
        color: Colors.gray,
        marginBottom: 16,
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginBottom: 16,
    },
    detailMessage: {
        fontFamily: Fonts.regular,
        fontSize: 16,
        color: '#374151',
        lineHeight: 24,
    },
    closeButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    closeButtonText: {
        fontFamily: Fonts.bold,
        fontSize: 16,
        color: 'white',
    },
});
