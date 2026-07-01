import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, StatusBar, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../theme';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { getAuthToken, removeAuthToken } from './utils/authTokenStorage';

export default function SplashScreen() {
    const router = useRouter();
    
    // Animation values
    const cabinScale = useRef(new Animated.Value(0.3)).current;
    const cabinOpacity = useRef(new Animated.Value(0)).current;
    
    const wheelsScale = useRef(new Animated.Value(0)).current;
    const wheelsOpacity = useRef(new Animated.Value(0)).current;
    
    const textOpacity = useRef(new Animated.Value(0)).current;
    const textTranslateY = useRef(new Animated.Value(20)).current;
    
    const screenFade = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // 1) Start the entry animation sequence
        Animated.sequence([
            // Step 1: Cabin drops & bounces
            Animated.parallel([
                Animated.spring(cabinScale, {
                    toValue: 1,
                    tension: 40,
                    friction: 6,
                    useNativeDriver: true,
                }),
                Animated.timing(cabinOpacity, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
            ]),
            // Step 2: Wheels pop & bounce (suspension settle)
            Animated.parallel([
                Animated.spring(wheelsScale, {
                    toValue: 1,
                    tension: 50,
                    friction: 5,
                    useNativeDriver: true,
                }),
                Animated.timing(wheelsOpacity, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]),
            // Step 3: Text fades in & slides up
            Animated.parallel([
                Animated.timing(textOpacity, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.timing(textTranslateY, {
                    toValue: 0,
                    duration: 600,
                    easing: Easing.out(Easing.back(1.5)),
                    useNativeDriver: true,
                }),
            ]),
        ]).start();

        // 2) Prepare session checks & navigation
        const prepareAndNavigate = async () => {
            let targetRoute = '/driver-onboarding';
            try {
                const token = await getAuthToken();
                // Give enough time to admire the animation (3.5s total)
                const minDelay = 3500; 

                const verificationPromise = verifySession();
                const minDelayPromise = new Promise(resolve => setTimeout(resolve, minDelay));

                const [determinedRoute] = await Promise.all([verificationPromise, minDelayPromise]);
                targetRoute = determinedRoute;

            } catch (e) {
                targetRoute = '/driver-onboarding';
            } finally {
                // Step 4: Fade out the entire screen before transitioning
                Animated.timing(screenFade, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }).start(() => {
                    router.replace(targetRoute as any);
                });
            }
        };

        const verifySession = async (): Promise<string> => {
            try {
                const token = await getAuthToken();
                if (!token) return '/driver-onboarding';
                if (!getApiBaseUrl()) return '/(tabs)';

                // Verification auprès du backend
                const res = await apiFetch('/driver/profile', {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                    },
                });

                if (!res) return '/(tabs)';

                if (res.status === 401) {
                    await removeAuthToken();
                    await AsyncStorage.removeItem('authUser');
                    await AsyncStorage.removeItem('hasSeenApprovalSuccess');
                    return '/driver-onboarding';
                }

                const json = await res.json().catch(() => null);

                if (!res.ok || !json?.profile) {
                    if (json && !json.profile) {
                        return '/become-driver';
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

    return (
        <Animated.View style={[styles.container, { opacity: screenFade }]}>
            <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" translucent={false} />
            
            <View style={styles.contentContainer}>
                {/* Main Logo Cabin */}
                <Animated.Image
                    source={require('../assets/images/logo_cabin.png')}
                    style={[
                        styles.cabin,
                        {
                            opacity: cabinOpacity,
                            transform: [{ scale: cabinScale }],
                            tintColor: '#FDD835',
                        }
                    ]}
                />
                
                {/* Wheels */}
                <Animated.Image
                    source={require('../assets/images/logo_wheels.png')}
                    style={[
                        styles.wheels,
                        {
                            opacity: wheelsOpacity,
                            transform: [{ scale: wheelsScale }],
                            tintColor: '#FDD835',
                        }
                    ]}
                />
                
                {/* Text kêkênon */}
                <Animated.Image
                    source={require('../assets/images/logo_text.png')}
                    style={[
                        styles.text,
                        {
                            opacity: textOpacity,
                            transform: [{ translateY: textTranslateY }],
                            tintColor: '#FDD835',
                        }
                    ]}
                />
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1A1A', // Dark background for Driver App
        justifyContent: 'center',
        alignItems: 'center',
    },
    contentContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    cabin: {
        width: 180,
        height: 170,
        resizeMode: 'contain',
    },
    wheels: {
        width: 120,
        height: 41,
        resizeMode: 'contain',
        marginTop: 10,
        marginBottom: 35,
    },
    text: {
        width: 200,
        height: 38,
        resizeMode: 'contain',
    },
});
