// screens/driver/ProfileScreen.tsx
import React, { useState, useRef } from 'react';
import { SafeAreaView, StyleSheet, Text, View, TouchableOpacity, ScrollView, Image, Switch, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../../theme'; // Assurez-vous que ces imports sont corrects
import { Fonts } from '../../../font';
import { useDriverStore } from '../../providers/DriverProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, getApiBaseUrl } from '../../utils/apiClient';
import { getImageUrl, withImageVersion } from '../../utils/images';
import { getAuthToken, removeAuthToken } from '../../utils/authTokenStorage';

// Données mock pour l'exemple (fallback si l'API ne répond pas)
const fallbackDriverData = {
  name: 'Chauffeur Porto',
  rating: 0,
  avatarLocal: require('../../../assets/images/LOGO_OR.png') as any,
  avatarUrl: '' as string | null,
  vehicle: 'Véhicule non renseigné',
  licensePlate: '---',
  documents: [
    { key: 'droit_taxi', name: 'Droit Taxi (Droit de place)', status: 'pending' as const, expiry: 'En attente' },
    { key: 'assurance_vehicule', name: 'Assurance véhicule', status: 'pending' as const, expiry: 'En attente' },
    { key: 'carte_grise', name: 'Carte grise', status: 'pending' as const, expiry: 'En attente' },
  ],
};

type DriverDocumentItem = {
  key: string;
  name: string;
  status: 'valid' | 'pending' | 'expired';
  expiry: string;
  url?: string | null;
};

// Helper pour le style des statuts (icône typée pour MaterialCommunityIcons)
type MCIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const getStatusStyle = (
  status: 'valid' | 'pending' | 'expired'
): { icon: MCIconName; color: string } => {
  switch (status) {
    case 'valid':
      return { icon: 'check-circle', color: '#4CAF50' };
    case 'pending':
      return { icon: 'clock-time-eight', color: '#FFC107' };
    case 'expired':
      return { icon: 'alert-circle', color: '#F44336' };
    default:
      return { icon: 'help-circle', color: Colors.gray };
  }
};

export default function DriverProfileScreen() {
  const router = useRouter();
  const { online, setOnline, navPref, setNavPref } = useDriverStore();
  const devTapCount = useRef(0);

  const handleDevTrigger = () => {
    devTapCount.current += 1;
    if (devTapCount.current >= 5) {
      devTapCount.current = 0;
      router.push('/dev-panel' as any);
    }
  };

  const [driverName, setDriverName] = useState(fallbackDriverData.name);
  const [rating, setRating] = useState(fallbackDriverData.rating);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(fallbackDriverData.avatarUrl);
  const [documents, setDocuments] = useState<DriverDocumentItem[]>(fallbackDriverData.documents);
  const [, setLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);


  const initials = React.useMemo(() => {
    const parts = (driverName || '').trim().split(/\s+/);
    if (!parts.length) return '';
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase();
  }, [driverName]);

  useFocusEffect(React.useCallback(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!getApiBaseUrl()) return;
        setLoading(true);
        setError(null);

        const token = await getAuthToken();
        if (!token) {
          setError("Connexion requise pour charger votre profil.");
          return;
        }

        const res = await apiFetch('/driver/profile', {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!res || !res.ok) {
          const body = res ? await res.json().catch(() => null) : null;
          const msg = body?.message || "Impossible de charger votre profil.";
          setError(msg);
          return;
        }

        const json = await res.json();
        if (cancelled) return;

        const user = json.user ?? {};
        const profile = json.profile ?? null;

        setDriverName(user.name ?? fallbackDriverData.name);
        setRating(user.rating ?? 0);

        const userPhoto: string | null = user.photo ?? null;
        const profilePhoto: string | null = profile?.photo ?? null;
        const finalPhoto = profilePhoto || userPhoto || null;

        const photoSeed = profile?.updated_at ?? user?.updated_at ?? profile?.id ?? user?.id ?? Date.now();
        setAvatarUrl(withImageVersion(getImageUrl(finalPhoto), photoSeed));

        const normalizeStatus = (value: any): DriverDocumentItem['status'] => {
          const s = String(value ?? '').toLowerCase();
          if (['valid', 'approved', 'ok'].includes(s)) return 'valid';
          if (['expired', 'invalid', 'rejected'].includes(s)) return 'expired';
          return 'pending';
        };

        const normalizeDocPath = (path: any) => {
          if (!path || typeof path !== 'string') return null;
          const candidate = path.trim();
          if (!candidate) return null;
          if (candidate.startsWith('http://') || candidate.startsWith('https://')) return candidate;
          return getImageUrl(candidate);
        };

        const normalizeDocuments = (raw: any): DriverDocumentItem[] => {
          if (!raw || typeof raw !== 'object') return [];

          if (Array.isArray(raw)) {
            return raw
              .map((d: any, i: number) => {
                const key = String(d?.key ?? `doc_${i + 1}`);
                const name = String(d?.name ?? d?.label ?? `Document ${i + 1}`);
                const path = d?.url ?? d?.path ?? d?.file ?? d?.value ?? null;
                const url = normalizeDocPath(path);
                const status = normalizeStatus(d?.status ?? (url ? 'valid' : 'pending'));
                const fallbackLabel = status === 'valid'
                  ? 'Document validé'
                  : status === 'expired'
                    ? 'Document rejeté/expiré'
                    : 'Document en cours de validation';
                const expiry = String(d?.expiry ?? fallbackLabel);
                return { key, name, status, expiry, url };
              })
              .filter((d) => !!d.name);
          }

          return Object.entries(raw).map(([key, value]: [string, any]) => {
            const isObj = value && typeof value === 'object';
            const name = String((isObj ? (value.name ?? value.label) : null) ?? key).replace(/[_-]/g, ' ');
            const path = isObj ? (value.url ?? value.path ?? value.file ?? value.value ?? null) : value;
            const url = normalizeDocPath(path);
            const status = normalizeStatus(isObj ? value.status : (url ? 'valid' : 'pending'));
            const fallbackLabel = status === 'valid'
              ? 'Document validé'
              : status === 'expired'
                ? 'Document rejeté/expiré'
                : 'Document en cours de validation';
            const expiry = String((isObj ? value.expiry : null) ?? fallbackLabel);
            return { key: String(key), name, status, expiry, url };
          });
        };

        const mappedDocs = normalizeDocuments(profile?.documents);

        // Toujours afficher la liste complète des documents attendus.
        // Les documents backend viennent enrichir/remplacer les valeurs du template.
        const byKey = new Map<string, DriverDocumentItem>();
        fallbackDriverData.documents.forEach((doc) => {
          byKey.set(doc.key, { ...doc });
        });
        mappedDocs.forEach((doc) => {
          const existing = byKey.get(doc.key);
          byKey.set(doc.key, {
            ...(existing ?? {
              key: doc.key,
              name: doc.name,
              status: 'pending' as const,
              expiry: 'Document en cours de validation',
              url: null,
            }),
            ...doc,
          });
        });

        setDocuments(Array.from(byKey.values()));
      } catch {
        if (!cancelled) {
          setError("Erreur réseau lors du chargement de votre profil.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []));

  const handleOpenPersonalInfo = () => router.push('/driver-existing-details' as any);
  const handleOpenVehicle = () => router.push('/driver-existing-account' as any);
  const handleOpenHelp = () => router.push('/help');
  const handleOpenDocument = async (doc: DriverDocumentItem) => {
    router.push({
      pathname: '/driver-document-upload',
      params: {
        key: doc.key,
        name: doc.name,
        currentUrl: doc.url || '',
      },
    } as any);
  };


  const navPrefLabel = (() => {
    switch (navPref) {
      case 'waze':
        return 'Waze';
      case 'gmaps':
        return 'Google Maps';
      default:
        return 'Automatique';
    }
  })();

  const handleChooseNavPref = () => {
    Alert.alert(
      'Navigation',
      'Choisis l’application par défaut',
      [
        { text: 'Automatique', onPress: () => setNavPref('auto') },
        { text: 'Waze', onPress: () => setNavPref('waze') },
        { text: 'Google Maps', onPress: () => setNavPref('gmaps') },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const performLogout = async () => {
    try {
      setLogoutLoading(true);
      const token = await getAuthToken();
      if (token && getApiBaseUrl()) {
        await apiFetch('/auth/logout', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
          },
        }).catch(() => { });
      }
      await removeAuthToken();
      setOnline(false);
      router.replace('/driver-phone-login');
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleChangePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'Autorisez l\'accès à vos photos pour changer votre photo de profil.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const uri = asset.uri;

      // On affiche l'image localement immédiatement
      setAvatarUrl(uri);
      setPhotoLoading(true);

      const token = await getAuthToken();
      if (!token || !getApiBaseUrl()) {
        setPhotoLoading(false);
        return;
      }

      // Déterminer le nom de fichier et le type MIME
      const filename = uri.split('/').pop() || 'photo.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        heic: 'image/heic',
      };
      const mimeType = mimeTypes[ext] || 'image/jpeg';

      const formData = new FormData();
      formData.append('_method', 'PUT');
      formData.append('photo', {
        uri: uri,
        name: filename,
        type: mimeType,
      } as any);

      const res = await apiFetch('/auth/profile', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          // NE PAS définir Content-Type manuellement — fetch le fait automatiquement pour FormData
        },
        body: formData,
      });

      if (!res) {
        throw new Error('Impossible de contacter le serveur.');
      }

      const text = await res.text();

      let json: any = null;
      try { json = JSON.parse(text); } catch { }

      if (!res || !res.ok) {
        throw new Error(json?.message || `Erreur serveur (${res?.status ?? '?'})`);
      }

      // Après upload réussi, on GARDE l'URI locale (qui s'affiche correctement)
      // L'URL serveur sera chargée au prochain refresh de la page profil.
      // On sauvegarde aussi la photo dans AsyncStorage pour que le header du dashboard puisse l'utiliser.
      const newPhotoPath = json?.photo || json?.user?.photo;
      if (newPhotoPath) {
        // Sauvegarder dans AsyncStorage pour le prochain chargement
        try {
          const userStr = await AsyncStorage.getItem('authUser');
          if (userStr) {
            const savedUser = JSON.parse(userStr);
            savedUser.photo = newPhotoPath;
            await AsyncStorage.setItem('authUser', JSON.stringify(savedUser));
          }
        } catch (saveErr) {
          console.warn('[Photo Upload] Erreur sauvegarde locale:', saveErr);
        }
      }

      Alert.alert('Succès', 'Votre photo de profil a été mise à jour.');
    } catch (e: any) {
      console.error('[Photo Upload] Erreur:', e);
      Alert.alert('Erreur', e?.message || 'Impossible de changer la photo.');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleLogout = () => {
    if (logoutLoading) return;
    Alert.alert(
      'Se déconnecter',
      'Voulez-vous vraiment vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: performLogout },
      ],
      { cancelable: true }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mon Profil</Text>
        <View style={styles.statusRow}>
          <View style={styles.statusTextBlock}>
            <Text style={styles.statusLabel}>Statut</Text>
            <Text style={[styles.statusValue, online ? styles.statusOnline : styles.statusOffline]}>
              {online ? 'En ligne' : 'Hors ligne'}
            </Text>
          </View>
          <Switch
            value={online}
            onValueChange={setOnline}
            trackColor={{ false: Colors.lightGray, true: Colors.primary + '55' }}
            thumbColor={online ? Colors.primary : '#f4f3f4'}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Carte d'Identité du Chauffeur */}
        <TouchableOpacity style={styles.profileCard} onPress={handleChangePhoto} disabled={photoLoading}>
          <View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={[styles.avatar, { backgroundColor: Colors.lightGray }]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            {photoLoading && (
              <View style={styles.photoLoaderOverlay}>
                <Text style={styles.loaderText}>...</Text>
              </View>
            )}
            <View style={styles.editIconBadge}>
              <MaterialCommunityIcons name="camera" size={16} color="white" />
            </View>
          </View>
          <Text style={styles.driverName}>{driverName}</Text>
          <View style={styles.ratingContainer}>
            <MaterialCommunityIcons name="star" size={16} color="#FFC107" />
            <Text style={styles.ratingText}>{rating.toFixed(2)}</Text>
          </View>
        </TouchableOpacity>

        {error && (
          <Text style={{ fontFamily: Fonts.titilliumWeb, fontSize: 13, color: 'red', marginBottom: 8 }}>
            {error}
          </Text>
        )}

        {/* Section Compte */}
        <Text style={styles.sectionTitle}>Compte</Text>
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuRow} onPress={handleOpenPersonalInfo}>
            <MaterialCommunityIcons name="account-edit-outline" size={24} color={Colors.primary} style={styles.menuIcon} />
            <Text style={styles.menuText}>Informations personnelles</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray} />
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity style={styles.menuRow} onPress={handleOpenVehicle}>
            <MaterialCommunityIcons name="car-outline" size={24} color={Colors.primary} style={styles.menuIcon} />
            <Text style={styles.menuText}>Mon véhicule</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray} />
          </TouchableOpacity>
        </View>

        {/* Section Documents */}
        <Text style={styles.sectionTitle}>Documents</Text>
        <View style={styles.menuCard}>
          {documents.map((doc, index) => {
            const { icon, color } = getStatusStyle(doc.status as any);
            return (
              <React.Fragment key={doc.key}>
                <TouchableOpacity style={styles.menuRow} onPress={() => handleOpenDocument(doc)}>
                  <MaterialCommunityIcons name={icon} size={24} color={color} style={styles.menuIcon} />
                  <View style={styles.docDetails}>
                    <Text style={styles.menuText}>{doc.name}</Text>
                    <Text style={[styles.docStatus, { color }]}>{doc.expiry}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.gray} />
                </TouchableOpacity>
                {index < documents.length - 1 && <View style={styles.separator} />}
              </React.Fragment>
            );
          })}
        </View>

        {/* Section Préférences */}
        <Text style={styles.sectionTitle}>Préférences</Text>
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuRow} onPress={handleChooseNavPref}>
            <MaterialCommunityIcons name="navigation-variant-outline" size={24} color={Colors.primary} style={styles.menuIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuText}>Application de navigation</Text>
              <Text style={styles.menuSubText}>{navPrefLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray} />
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={{ marginTop: 24 }}>
          <TouchableOpacity
            style={[styles.menuRow, styles.actionButton]}
            onPress={() => router.push('/become-driver')}
          >
            <MaterialCommunityIcons name="steering" size={24} color={Colors.primary} style={styles.menuIcon} />
            <Text style={styles.menuText}>Compléter mon profil chauffeur</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuRow, styles.actionButton]} onPress={handleOpenHelp}>
            <MaterialCommunityIcons name="help-circle-outline" size={24} color={Colors.primary} style={styles.menuIcon} />
            <Text style={styles.menuText}>Aide et Support</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuRow, styles.actionButton, { marginTop: 12, opacity: logoutLoading ? 0.6 : 1 }]}
            onPress={handleLogout}
            disabled={logoutLoading}
          >
            <MaterialCommunityIcons name="logout" size={24} color="#F44336" style={styles.menuIcon} />
            <Text style={[styles.menuText, { color: '#F44336' }]}>
              {logoutLoading ? 'Déconnexion…' : 'Se déconnecter'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              'Supprimer mon compte',
              'Cette action est irréversible. Toutes vos données seront supprimées. Êtes-vous sûr ?',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Supprimer',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const token = await getAuthToken();
                      if (!token || !getApiBaseUrl()) return;
                      const res = await apiFetch('/auth/account', {
                        method: 'DELETE',
                        headers: { Accept: 'application/json' },
                      });
                      if (res?.ok) {
                        await removeAuthToken();
                        Alert.alert('Compte supprimé', 'Votre compte a été supprimé.');
                        router.replace('/driver-phone-login');
                      } else {
                        Alert.alert('Erreur', 'Impossible de supprimer le compte.');
                      }
                    } catch {
                      Alert.alert('Erreur', 'Une erreur est survenue.');
                    }
                  }
                }
              ]
            );
          }}
          style={{ alignItems: 'center', marginTop: 20, flexDirection: 'row', justifyContent: 'center', gap: 6 }}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#94a3b8" />
          <Text style={{ fontFamily: Fonts.titilliumWeb, fontSize: 14, color: '#94a3b8' }}>Supprimer mon compte</Text>
        </TouchableOpacity>

        {/* Version + DevPanel trigger */}
        <TouchableOpacity onPress={handleDevTrigger} activeOpacity={1} style={{ marginTop: 20, marginBottom: 20, alignItems: 'center' }}>
          <Text style={{ fontFamily: Fonts.titilliumWeb, fontSize: 12, color: Colors.gray }}>v1.2.0 • TIC Miton</Text>
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
  header: {
    padding: 20,
    paddingBottom: 10,
    backgroundColor: 'white',
  },
  headerTitle: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 24,
    color: Colors.black,
  },
  statusRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTextBlock: {
    flexDirection: 'column',
  },
  statusLabel: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 13,
    color: Colors.gray,
  },
  statusValue: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 15,
  },
  statusOnline: {
    color: '#16a34a',
  },
  statusOffline: {
    color: '#b91c1c',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  profileCard: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: Colors.primary,
    marginBottom: 12,
  },
  driverName: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 22,
    color: Colors.black,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ratingText: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 14,
    color: '#FFA000',
    marginLeft: 6,
  },
  sectionTitle: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 16,
    color: Colors.gray,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  menuCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 24,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  menuIcon: {
    marginRight: 16,
  },
  menuText: {
    flex: 1,
    fontFamily: Fonts.titilliumWebSemiBold,
    fontSize: 16,
    color: Colors.black,
  },
  menuSubText: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 13,
    color: Colors.gray,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.lightGray,
    marginLeft: 56, // Aligné avec le début du texte
  },
  docDetails: {
    flex: 1,
  },
  docStatus: {
    fontFamily: Fonts.titilliumWeb,
    fontSize: 13,
    marginTop: 2,
  },
  actionButton: {
    backgroundColor: 'white',
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: Fonts.titilliumWebBold,
    fontSize: 32,
    color: 'white',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  editIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  photoLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    color: 'white',
    fontFamily: Fonts.titilliumWebBold,
  },
});
