import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Image, Animated, StatusBar } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../theme';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { getAuthToken, removeAuthToken } from './utils/authTokenStorage';

export default function SplashScreen() {
    const router = useRouter();
    const segments = useSegments();
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        const prepareAndNavigate = async () => {
            let targetRoute = '/driver-onboarding';
            try {
                // 1) Vérifier la présence du token pour décider du délai
                const token = await getAuthToken();
                const minDelay = token ? 1500 : 5000; // 1.5s pour les habitués, 5s pour les nouveaux

                // 2) Lancer la vérification et le timer en parallèle
                const verificationPromise = verifySession();
                const minDelayPromise = new Promise(resolve => setTimeout(resolve, minDelay));

                // 3) Attendre que les deux soient terminés
                const [determinedRoute] = await Promise.all([verificationPromise, minDelayPromise]);
                targetRoute = determinedRoute;

            } catch (e) {
                // En cas d'erreur fatale
                targetRoute = '/driver-onboarding';
            } finally {
                setIsChecking(false);
                router.replace(targetRoute as any);
            }
        };

        const verifySession = async (): Promise<string> => {
            try {
                const token = await getAuthToken();

                if (!token) {
                    return '/driver-onboarding';
                }

                if (!getApiBaseUrl()) {
                    return '/(tabs)';
                }

                // Vérification auprès du backend
                const res = await apiFetch('/driver/profile', {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                    },
                });

                if (!res) {
                    return '/(tabs)';
                }

                if (res.status === 401) {
                    await removeAuthToken();
                    await AsyncStorage.removeItem('authUser');
                    await AsyncStorage.removeItem('hasSeenApprovalSuccess');
                    return '/driver-onboarding';
                }

                const json = await res.json().catch(() => null);

                if (!res.ok || !json?.profile) {
                    if (json && !json.profile) {
                        return '/driver-onboarding';
                    }
                    return '/(tabs)';
                }

                const status = json.profile.status;
                const contractAcceptedAt = json.profile.contract_accepted_at;

                if (status === 'pending') return '/driver-pending-approval';
                if (status === 'rejected') return '/driver-application-rejected';
                if (status === 'approved') {
                    const hasSeenSuccess = await AsyncStorage.getItem('hasSeenApprovalSuccess');
                    if (!hasSeenSuccess) return '/driver-approved-success';
                    if (!contractAcceptedAt) return '/driver-contract';
                    return '/(tabs)';
                }

                return '/(tabs)';

            } catch (error) {
                return '/(tabs)';
            }
        };

        prepareAndNavigate();
    }, []);

    if (isChecking || (segments as any).length === 0 || (segments as any)[0] === 'index') {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor={Colors.primary} translucent />
                <Animated.View style={[
                    styles.contentContainer,
                    {
                        opacity: fadeAnim,
                        transform: [{ scale: scaleAnim }]
                    }
                ]}>
                    <Image
                        source={require('../assets/images/Logo blanc.png')}
                        style={{ width: 150, height: 150, resizeMode: 'contain' }}
                    />
                    <ActivityIndicator size="large" color="white" style={{ marginTop: 20 }} />
                </Animated.View>
            </View>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.primary,
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20
    }
});
