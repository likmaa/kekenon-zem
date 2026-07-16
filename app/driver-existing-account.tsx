// app/driver-existing-account.tsx
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { getAuthToken, removeAuthToken } from './utils/authTokenStorage';

export default function DriverExistingAccountScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Vehicle information
    const [vehicleMake, setVehicleMake] = useState('');
    const [vehicleModel, setVehicleModel] = useState('');
    const [vehicleYear, setVehicleYear] = useState('');
    const [vehicleColor, setVehicleColor] = useState('');
    const [licensePlate, setLicensePlate] = useState('');
    const [vehicleType, setVehicleType] = useState('sedan'); // sedan, suv, van, etc.

    useEffect(() => {
        loadVehicleInfo();
    }, []);

    const loadVehicleInfo = async () => {
        try {
            setLoading(true);
            const token = await getAuthToken();
            if (!token || !getApiBaseUrl()) return;

            const res = await apiFetch('/driver/profile', {
                headers: {
                    Accept: 'application/json',
                },
            });

            if (res?.ok) {
                const json = await res.json();
                const profile = json.profile ?? {};

                setVehicleMake(profile.vehicle_make ?? '');
                setVehicleModel(profile.vehicle_model ?? '');
                setVehicleYear(profile.vehicle_year ?? '');
                setVehicleColor(profile.vehicle_color ?? '');
                setLicensePlate(profile.license_plate ?? '');
                setVehicleType(profile.vehicle_type ?? 'sedan');
            }
        } catch (error) {
            console.error('Error loading vehicle info:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        // Validation
        if (!vehicleMake.trim()) {
            Alert.alert('Erreur', 'Veuillez entrer la marque du véhicule');
            return;
        }
        if (!vehicleModel.trim()) {
            Alert.alert('Erreur', 'Veuillez entrer le modèle du véhicule');
            return;
        }
        if (!licensePlate.trim()) {
            Alert.alert('Erreur', 'Veuillez entrer la plaque d\'immatriculation');
            return;
        }

        try {
            setSaving(true);
            const token = await getAuthToken();
            if (!token) {
                Alert.alert('Erreur', 'Session expirée. Veuillez vous reconnecter.');
                return;
            }

            const res = await apiFetch('/driver/update-vehicle', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    vehicle_make: vehicleMake,
                    vehicle_model: vehicleModel,
                    vehicle_year: vehicleYear,
                    vehicle_color: vehicleColor,
                    license_plate: licensePlate,
                    vehicle_type: vehicleType,
                }),
            });

            if (!res) {
                Alert.alert('Erreur', 'Impossible de contacter le serveur.');
                return;
            }
            const json = await res.json();

            if (res.ok) {
                Alert.alert('Succès', 'Informations du véhicule mises à jour', [
                    { text: 'OK', onPress: () => router.back() },
                ]);
            } else {
                Alert.alert('Erreur', json.message || 'Impossible de mettre à jour les informations');
            }
        } catch (error) {
            Alert.alert('Erreur', 'Une erreur est survenue lors de la mise à jour');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Chargement...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.black} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Mon Véhicule</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.sectionTitle}>Informations du véhicule</Text>

                {/* Vehicle Make */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Marque *</Text>
                    <TextInput
                        style={styles.input}
                        value={vehicleMake}
                        onChangeText={setVehicleMake}
                        placeholder="Ex: Toyota, Honda, Mercedes"
                        placeholderTextColor={Colors.gray}
                    />
                </View>

                {/* Vehicle Model */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Modèle *</Text>
                    <TextInput
                        style={styles.input}
                        value={vehicleModel}
                        onChangeText={setVehicleModel}
                        placeholder="Ex: Corolla, Civic, C-Class"
                        placeholderTextColor={Colors.gray}
                    />
                </View>

                {/* Vehicle Year */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Année</Text>
                    <TextInput
                        style={styles.input}
                        value={vehicleYear}
                        onChangeText={setVehicleYear}
                        placeholder="Ex: 2020"
                        placeholderTextColor={Colors.gray}
                        keyboardType="numeric"
                    />
                </View>

                {/* Vehicle Color */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Couleur</Text>
                    <TextInput
                        style={styles.input}
                        value={vehicleColor}
                        onChangeText={setVehicleColor}
                        placeholder="Ex: Noir, Blanc, Gris"
                        placeholderTextColor={Colors.gray}
                    />
                </View>

                {/* License Plate */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Plaque d'immatriculation *</Text>
                    <TextInput
                        style={styles.input}
                        value={licensePlate}
                        onChangeText={setLicensePlate}
                        placeholder="Ex: AB-1234-CD"
                        placeholderTextColor={Colors.gray}
                        autoCapitalize="characters"
                    />
                </View>

                {/* Vehicle Type */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Type de véhicule</Text>
                    <View style={styles.typeSelector}>
                        {['sedan', 'suv', 'van', 'compact'].map((type) => (
                            <TouchableOpacity
                                key={type}
                                style={[
                                    styles.typeButton,
                                    vehicleType === type && styles.typeButtonActive,
                                ]}
                                onPress={() => setVehicleType(type)}
                            >
                                <Text
                                    style={[
                                        styles.typeButtonText,
                                        vehicleType === type && styles.typeButtonTextActive,
                                    ]}
                                >
                                    {type.charAt(0).toUpperCase() + type.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Save Button */}
                <TouchableOpacity
                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.saveButtonText}>Enregistrer</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontFamily: Fonts.regular,
        fontSize: 16,
        color: Colors.gray,
        marginTop: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: Colors.lightGray,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontFamily: Fonts.bold,
        fontSize: 18,
        color: Colors.black,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    sectionTitle: {
        fontFamily: Fonts.bold,
        fontSize: 16,
        color: Colors.gray,
        marginBottom: 20,
        textTransform: 'uppercase',
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontFamily: Fonts.bold,
        fontSize: 14,
        color: Colors.black,
        marginBottom: 8,
    },
    input: {
        backgroundColor: 'white',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: Fonts.regular,
        fontSize: 16,
        color: Colors.black,
        borderWidth: 1,
        borderColor: Colors.lightGray,
    },
    typeSelector: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    typeButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: Colors.lightGray,
    },
    typeButtonActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    typeButtonText: {
        fontFamily: Fonts.bold,
        fontSize: 14,
        color: Colors.gray,
    },
    typeButtonTextActive: {
        color: 'white',
    },
    saveButton: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 20,
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        fontFamily: Fonts.bold,
        fontSize: 16,
        color: 'white',
    },
});
