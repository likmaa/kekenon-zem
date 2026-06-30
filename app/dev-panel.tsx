import React, { useEffect, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Share,
    Platform,
    Alert,
    StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { logger, LogEntry } from './utils/logger';

export default function DevPanel() {
    const navigation = useNavigation();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [viewMode, setViewMode] = useState<'list' | 'raw'>('list');

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        const fetchedLogs = await logger.getLocalLogs();
        setLogs(fetchedLogs);
    };

    const clearLogs = () => {
        Alert.alert(
            'Effacer les logs',
            'Voulez-vous effacer tous les logs locaux ?',
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Effacer', style: 'destructive', onPress: async () => {
                        await logger.clearLocalLogs();
                        setLogs([]);
                    }
                },
            ]
        );
    };

    const shareLogs = async () => {
        try {
            await Share.share({
                message: JSON.stringify(logs, null, 2),
            });
        } catch (error) {
            console.error(error);
        }
    };

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'error': return '#EF4444';
            case 'warning': return '#F59E0B';
            case 'info': return '#3B82F6';
            default: return '#6B7280';
        }
    };

    const getLevelIcon = (level: string): keyof typeof Ionicons.glyphMap => {
        switch (level) {
            case 'error': return 'alert-circle';
            case 'warning': return 'warning';
            case 'info': return 'information-circle';
            default: return 'code-slash';
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={Colors.black} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.title}>🛠 Panel Développeur</Text>
                    <Text style={styles.logCount}>{logs.length} logs</Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity onPress={shareLogs} style={styles.headerBtn}>
                        <Ionicons name="share-social-outline" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={clearLogs} style={styles.headerBtn}>
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Env Info */}
            <View style={styles.envInfo}>
                <View style={styles.envRow}>
                    <Ionicons name="server-outline" size={14} color="#9CA3AF" />
                    <Text style={styles.envText}>{process.env.EXPO_PUBLIC_API_URL}</Text>
                </View>
                <View style={styles.envRow}>
                    <Ionicons name="code-slash-outline" size={14} color="#9CA3AF" />
                    <Text style={styles.envText}>{__DEV__ ? 'Development' : 'Production'} • {Platform.OS} {Platform.Version}</Text>
                </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, viewMode === 'list' && styles.activeTab]}
                    onPress={() => setViewMode('list')}
                >
                    <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? Colors.primary : '#6B7280'} />
                    <Text style={[styles.tabText, viewMode === 'list' && styles.activeTabText]}>Logs</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, viewMode === 'raw' && styles.activeTab]}
                    onPress={() => setViewMode('raw')}
                >
                    <Ionicons name="code-outline" size={16} color={viewMode === 'raw' ? Colors.primary : '#6B7280'} />
                    <Text style={[styles.tabText, viewMode === 'raw' && styles.activeTabText]}>JSON Logs</Text>
                </TouchableOpacity>
            </View>

            {/* Content */}
            {viewMode === 'list' && (
                <ScrollView style={styles.logList} contentContainerStyle={styles.logListContent}>
                    {logs.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
                            <Text style={styles.emptyTitle}>Aucun log</Text>
                            <Text style={styles.emptySubtitle}>Les logs apparaîtront ici automatiquement</Text>
                        </View>
                    ) : (
                        logs.map((log, index) => (
                            <View key={index} style={styles.logItem}>
                                <View style={styles.logHeader}>
                                    <View style={styles.logLevelRow}>
                                        <Ionicons name={getLevelIcon(log.level)} size={16} color={getLevelColor(log.level)} />
                                        <View style={[styles.levelBadge, { backgroundColor: getLevelColor(log.level) + '20' }]}>
                                            <Text style={[styles.levelText, { color: getLevelColor(log.level) }]}>{log.level.toUpperCase()}</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.timestamp}>{new Date(log.timestamp).toLocaleTimeString()}</Text>
                                </View>
                                <Text style={styles.message}>{log.message}</Text>
                                {log.context && (
                                    <View style={styles.contextContainer}>
                                        <Text style={styles.context}>{JSON.stringify(log.context, null, 2)}</Text>
                                    </View>
                                )}
                            </View>
                        ))
                    )}
                </ScrollView>
            )}

            {viewMode === 'raw' && (
                <ScrollView style={styles.rawContainer} contentContainerStyle={{ padding: 16 }}>
                    <Text style={styles.rawText}>{JSON.stringify(logs, null, 2)}</Text>
                </ScrollView>
            )}

            {/* FAB Refresh */}
            <TouchableOpacity style={styles.refreshBtn} onPress={loadLogs} activeOpacity={0.8}>
                <Ionicons name="refresh" size={22} color="white" />
            </TouchableOpacity>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FD',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 48,
        paddingBottom: 12,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
        marginLeft: 12,
    },
    title: {
        fontSize: 18,
        fontFamily: Fonts.titilliumWebBold,
        color: Colors.black,
    },
    logCount: {
        fontSize: 12,
        fontFamily: Fonts.titilliumWeb,
        color: Colors.gray,
        marginTop: 1,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 4,
    },
    headerBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    envInfo: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#1F2937',
        gap: 4,
    },
    envRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    envText: {
        color: '#9CA3AF',
        fontSize: 11,
        fontFamily: 'monospace',
    },
    tabs: {
        flexDirection: 'row',
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        paddingHorizontal: 16,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        gap: 6,
    },
    activeTab: {
        borderBottomWidth: 2,
        borderBottomColor: Colors.primary,
    },
    tabText: {
        fontSize: 13,
        fontFamily: Fonts.titilliumWeb,
        color: '#6B7280',
    },
    activeTabText: {
        color: Colors.primary,
        fontFamily: Fonts.titilliumWebBold,
    },
    logList: {
        flex: 1,
    },
    logListContent: {
        paddingBottom: 80,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        gap: 8,
    },
    emptyTitle: {
        fontFamily: Fonts.titilliumWebBold,
        fontSize: 16,
        color: '#6B7280',
    },
    emptySubtitle: {
        fontFamily: Fonts.titilliumWeb,
        fontSize: 13,
        color: '#9CA3AF',
    },
    logItem: {
        backgroundColor: 'white',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    logLevelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    levelBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    levelText: {
        fontSize: 10,
        fontFamily: Fonts.titilliumWebBold,
    },
    timestamp: {
        fontSize: 11,
        fontFamily: Fonts.titilliumWeb,
        color: '#9CA3AF',
    },
    message: {
        fontSize: 14,
        color: '#1F2937',
        fontFamily: Fonts.titilliumWebSemiBold,
    },
    contextContainer: {
        marginTop: 8,
        backgroundColor: '#F8FAFC',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    context: {
        fontSize: 11,
        color: '#475569',
        fontFamily: 'monospace',
        lineHeight: 16,
    },
    rawContainer: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    rawText: {
        color: '#86EFAC',
        fontSize: 12,
        fontFamily: 'monospace',
        lineHeight: 18,
    },
    refreshBtn: {
        position: 'absolute',
        right: 20,
        bottom: 30,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
});
