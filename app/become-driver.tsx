import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  StyleSheet,
  Image,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch, getApiBaseUrl } from './utils/apiClient';
import { getAuthToken } from './utils/authTokenStorage';

const { width: WIN_W } = Dimensions.get('window');

const COLOR_OPTIONS = [
  { name: 'Blanc', hex: '#FFFFFF', border: '#D0D0D0' },
  { name: 'Noir', hex: '#1A1A1A', border: 'transparent' },
  { name: 'Rouge', hex: '#E53935', border: 'transparent' },
  { name: 'Jaune', hex: '#FFD700', border: 'transparent' },
  { name: 'Bleu', hex: '#1E88E5', border: 'transparent' },
  { name: 'Vert', hex: '#43A047', border: 'transparent' },
];

export default function BecomeDriverScreen() {
  const router = useRouter();

  // internal step navigation
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 - Personal Info
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // Step 1 - Professional Info
  const [workZone, setWorkZone] = useState('');
  const [vehicleModel, setVehicleModel] = useState(''); // Type de moto (Marque et couleur)
  const [vehicleColor, setVehicleColor] = useState('Blanc');

  // Step 2 - Documents & Vehicle info
  const [licensePlate, setLicensePlate] = useState(''); // Plaque (immatriculation)
  const [chassisNumber, setChassisNumber] = useState(''); // Numéro Chassi
  const [identityFile, setIdentityFile] = useState<string | null>(null);
  const [motoFile, setMotoFile] = useState<string | null>(null);

  // Load phone number on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userStr = await AsyncStorage.getItem('authUser');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.phone) {
            setPhone(user.phone);
          }
        }
      } catch (e) {
        console.warn('Failed to load user phone number', e);
      }
    };
    fetchUser();
  }, []);

  const pickImage = async (target: 'profile' | 'identity' | 'moto') => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'Autorisez l’accès aux photos pour sélectionner un fichier.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      if (target === 'profile') {
        setProfilePhoto(uri);
      } else if (target === 'identity') {
        setIdentityFile(uri);
      } else if (target === 'moto') {
        setMotoFile(uri);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de charger l’image.');
    }
  };

  const validateStep1 = () => {
    if (!lastName.trim()) {
      setError('Veuillez renseigner votre nom.');
      return false;
    }
    if (!firstName.trim()) {
      setError('Veuillez renseigner votre prénom.');
      return false;
    }
    if (!profilePhoto) {
      setError('Veuillez télécharger votre photo de profil.');
      return false;
    }
    if (!workZone.trim()) {
      setError('Veuillez renseigner votre zone de travail (quartier).');
      return false;
    }
    if (!vehicleModel.trim()) {
      setError('Veuillez renseigner la marque et le modèle de votre moto.');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = () => {
    if (!licensePlate.trim()) {
      setError('Veuillez renseigner le numéro d’immatriculation.');
      return false;
    }
    if (!chassisNumber.trim()) {
      setError('Veuillez renseigner le numéro de châssis.');
      return false;
    }
    if (!identityFile) {
      setError('Veuillez télécharger votre pièce d’identité.');
      return false;
    }
    if (!motoFile) {
      setError('Veuillez télécharger la photo de la moto.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleNext = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handlePrev = () => {
    setError(null);
    setStep(1);
  };

  const submit = async () => {
    if (!getApiBaseUrl()) {
      setError('URL API non configurée');
      return;
    }
    if (!validateStep2()) return;

    try {
      setLoading(true);
      setError(null);

      const token = await getAuthToken();
      if (!token) {
        setError('Vous devez être connecté pour envoyer votre dossier.');
        return;
      }

      // 1. Update User info (Name + profile photo)
      const userFd = new FormData();
      userFd.append('_method', 'PUT');
      userFd.append('name', `${firstName.trim()} ${lastName.trim()}`);
      userFd.append('phone', phone.trim());

      if (profilePhoto) {
        const filename = profilePhoto.split('/').pop() || 'profile.jpg';
        const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        userFd.append('photo', {
          uri: profilePhoto,
          name: filename,
          type: mime,
        } as any);
      }

      const userRes = await apiFetch('/auth/profile', {
        method: 'POST', // spoofed PUT
        body: userFd,
      });

      if (!userRes || !userRes.ok) {
        const json = await userRes?.json().catch(() => null);
        throw new Error(json?.message || "Échec de l'enregistrement des informations personnelles.");
      }

      // Update authUser cache locally
      const updatedUserJson = await userRes.json().catch(() => null);
      if (updatedUserJson) {
        await AsyncStorage.setItem('authUser', JSON.stringify(updatedUserJson));
      }

      // 2. Create/Update Driver Profile (vehicle info)
      const driverRes = await apiFetch('/driver/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          license_number: licensePlate.trim(), // Required field
          license_plate: licensePlate.trim(),
          vehicle_number: chassisNumber.trim(), // chassis
          vehicle_make: vehicleModel.trim(), // Brand/type of moto
          vehicle_color: vehicleColor,
          vehicle_type: 'sedan', // default placeholder role
        }),
      });

      if (!driverRes || !driverRes.ok) {
        const json = await driverRes?.json().catch(() => null);
        throw new Error(json?.message || "Échec de l'enregistrement du véhicule.");
      }

      // 3. Upload Identity document
      const idFilename = identityFile!.split('/').pop() || 'identity.jpg';
      const idExt = idFilename.split('.').pop()?.toLowerCase() || 'jpg';
      const idMime = idExt === 'png' ? 'image/png' : 'image/jpeg';
      const idFd = new FormData();
      idFd.append('document_key', 'identity');
      idFd.append('name', "Pièce d'identité");
      idFd.append('status', 'pending');
      idFd.append('file', {
        uri: identityFile,
        name: idFilename,
        type: idMime,
      } as any);

      const idRes = await apiFetch('/driver/profile/documents', {
        method: 'POST',
        body: idFd,
      });

      if (!idRes || !idRes.ok) {
        throw new Error("Échec de l'envoi de la pièce d'identité.");
      }

      // 4. Upload Moto Photo document
      const motoFilename = motoFile!.split('/').pop() || 'vehicle.jpg';
      const motoExt = motoFilename.split('.').pop()?.toLowerCase() || 'jpg';
      const motoMime = motoExt === 'png' ? 'image/png' : 'image/jpeg';
      const motoFd = new FormData();
      motoFd.append('document_key', 'vehicle_photo');
      motoFd.append('name', "Photo de la moto");
      motoFd.append('status', 'pending');
      motoFd.append('file', {
        uri: motoFile,
        name: motoFilename,
        type: motoMime,
      } as any);

      const motoRes = await apiFetch('/driver/profile/documents', {
        method: 'POST',
        body: motoFd,
      });

      if (!motoRes || !motoRes.ok) {
        throw new Error("Échec de l'envoi de la photo de la moto.");
      }

      Alert.alert(
        'Dossier envoyé',
        'Vos informations et documents ont été enregistrés avec succès. Notre équipe va maintenant étudier votre dossier de validation.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace('/driver-pending-approval');
            },
          },
        ]
      );

    } catch (e: any) {
      const msg = e?.message || 'Erreur réseau lors de l’envoi.';
      setError(msg);
      Alert.alert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#37BD6B" />

      {/* Header Banner card */}
      <View style={styles.bannerHeader}>
        <View style={styles.logoRow}>
          <Image
            source={require('../assets/images/logo_cabin.png')}
            style={[styles.logoCabin, { tintColor: Colors.white }]}
          />
          <Image
            source={require('../assets/images/logo_wheels.png')}
            style={[styles.logoWheels, { tintColor: Colors.white }]}
          />
        </View>
        <Text style={styles.welcomeText}>Kwaboo !</Text>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 ? (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Informations personnelles</Text>

              <Text style={styles.fieldLabel}>Nom</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Votre nom"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Prénoms</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Votre prénom.s"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Numéro de téléphone</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Numéro de téléphone"
                keyboardType="phone-pad"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Télécharger votre photo profil</Text>
              <TouchableOpacity
                style={styles.uploadBox}
                activeOpacity={0.8}
                onPress={() => pickImage('profile')}
              >
                {profilePhoto ? (
                  <View style={styles.uploadPreviewRow}>
                    <Image source={{ uri: profilePhoto }} style={styles.uploadThumbnail} />
                    <Text style={styles.uploadFileName} numberOfLines={1}>Fichier sélectionné</Text>
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    </View>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholderRow}>
                    <Text style={styles.uploadPlaceholderText}>Télécharger votre fichier ici</Text>
                    <View style={styles.cameraCircle}>
                      <Ionicons name="camera-outline" size={18} color="#1A1A1A" />
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.divider} />

              <Text style={styles.stepTitle}>Informations professionnelles</Text>

              <Text style={styles.fieldLabel}>Zone de travail</Text>
              <TextInput
                value={workZone}
                onChangeText={setWorkZone}
                placeholder="Quartier"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Type de moto</Text>
              <TextInput
                value={vehicleModel}
                onChangeText={setVehicleModel}
                placeholder="Marque et couleur de votre moto"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Sélectionnez Couleur de moto</Text>
              <View style={styles.colorSelectorRow}>
                {COLOR_OPTIONS.map((c) => {
                  const isSelected = vehicleColor === c.name;
                  const checkColor = c.name === 'Blanc' || c.name === 'Jaune' ? '#1A1A1A' : '#FFFFFF';
                  return (
                    <TouchableOpacity
                      key={c.name}
                      onPress={() => setVehicleColor(c.name)}
                      activeOpacity={0.85}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: c.hex, borderColor: c.border },
                        isSelected && styles.colorCircleSelected,
                      ]}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={15} color={checkColor} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.navigationRow}>
                <View />
                <TouchableOpacity
                  style={styles.nextTextBtn}
                  activeOpacity={0.7}
                  onPress={handleNext}
                >
                  <Text style={styles.nextText}>Suivant</Text>
                  <Ionicons name="arrow-forward" size={16} color="#1A1A1A" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Identité & Véhicule</Text>

              <Text style={styles.fieldLabel}>Numéro d'immatriculation</Text>
              <TextInput
                value={licensePlate}
                onChangeText={setLicensePlate}
                placeholder="Entrez numéro d'immatriculation de la moto"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Numéro Châssis</Text>
              <TextInput
                value={chassisNumber}
                onChangeText={setChassisNumber}
                placeholder="Entrez num chassie"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>P. d'identité ( permis, Cip, passeport, carte ID )</Text>
              <TouchableOpacity
                style={styles.uploadBox}
                activeOpacity={0.8}
                onPress={() => pickImage('identity')}
              >
                {identityFile ? (
                  <View style={styles.uploadPreviewRow}>
                    <Image source={{ uri: identityFile }} style={styles.uploadThumbnail} />
                    <Text style={styles.uploadFileName} numberOfLines={1}>Fichier sélectionné</Text>
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    </View>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholderRow}>
                    <Text style={styles.uploadPlaceholderText}>Téléchargez votre pièce ici</Text>
                    <View style={styles.cameraCircle}>
                      <Ionicons name="camera-outline" size={18} color="#1A1A1A" />
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Télécharger une photo de la moto</Text>
              <TouchableOpacity
                style={styles.uploadBox}
                activeOpacity={0.8}
                onPress={() => pickImage('moto')}
              >
                {motoFile ? (
                  <View style={styles.uploadPreviewRow}>
                    <Image source={{ uri: motoFile }} style={styles.uploadThumbnail} />
                    <Text style={styles.uploadFileName} numberOfLines={1}>Fichier sélectionné</Text>
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    </View>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholderRow}>
                    <Text style={styles.uploadPlaceholderText}>Télécharger votre fichier ici</Text>
                    <View style={styles.cameraCircle}>
                      <Ionicons name="camera-outline" size={18} color="#1A1A1A" />
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.navigationRow}>
                <TouchableOpacity
                  style={styles.prevTextBtn}
                  activeOpacity={0.7}
                  onPress={handlePrev}
                >
                  <Ionicons name="arrow-back" size={16} color="#757575" />
                  <Text style={styles.prevText}>Précédent</Text>
                </TouchableOpacity>
                <View />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
                activeOpacity={0.88}
                onPress={submit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#1A1A1A" />
                ) : (
                  <Text style={styles.saveBtnText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  bannerHeader: {
    backgroundColor: '#37BD6B',
    height: 190,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 24 : 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  logoRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoCabin: {
    width: 60,
    height: 56,
    resizeMode: 'contain',
  },
  logoWheels: {
    width: 40,
    height: 14,
    resizeMode: 'contain',
    marginTop: 3,
  },
  welcomeText: {
    fontFamily: Fonts.bold,
    fontSize: 34,
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  stepContainer: {
    width: '100%',
  },
  stepTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: '#1A1A1A',
    marginBottom: 16,
    letterSpacing: -0.4,
  },
  fieldLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: '#1A1A1A',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: '#1A1A1A',
  },
  uploadBox: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  uploadPlaceholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadPlaceholderText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: '#8E8E93',
  },
  cameraCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadThumbnail: {
    width: 36,
    height: 36,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  uploadFileName: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: '#1A1A1A',
    flex: 1,
    marginLeft: 12,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginVertical: 20,
  },
  colorSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: 20,
  },
  colorCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  colorCircleSelected: {
    borderWidth: 2.5,
    borderColor: '#37BD6B',
  },
  errorText: {
    color: '#E53935',
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  navigationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  prevTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  prevText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: '#757575',
  },
  nextTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  nextText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: '#1A1A1A',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 17,
    color: '#1A1A1A',
  },
});
