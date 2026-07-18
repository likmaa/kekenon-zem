// screens/driver/ProfileScreen.tsx
import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../theme';
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
  const insets = useSafeAreaInsets();
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
  const [loading, setLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const validDocumentCount = React.useMemo(
    () => documents.filter(document => document.status === 'valid').length,
    [documents],
  );


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
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.pageContent}
      >
        <LinearGradient
          colors={[Colors.primary, '#FFC928', Colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 14 }]}
        >
          <Image
            source={require('../../../assets/images/logo_cabin.png')}
            style={styles.watermark}
            resizeMode="contain"
          />
          <View style={styles.heroHeading}>
            <View>
              <Text style={styles.heroEyebrow}>Espace chauffeur</Text>
              <Text style={styles.heroTitle}>Mon profil</Text>
            </View>
            <View style={[styles.onlineBadge, !online && styles.offlineBadge]}>
              <View style={[styles.onlineDot, !online && styles.offlineDot]} />
              <Text style={styles.onlineBadgeText}>{online ? 'En ligne' : 'Hors ligne'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.identityRow}
            onPress={handleChangePhoto}
            disabled={photoLoading}
            activeOpacity={0.82}
            accessibilityLabel="Changer la photo de profil"
          >
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} resizeMode="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              {photoLoading && (
                <View style={styles.photoLoaderOverlay}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              )}
              <View style={styles.editIconBadge}>
                <MaterialCommunityIcons name="camera" size={15} color={Colors.dark} />
              </View>
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.driverName} numberOfLines={1}>{driverName}</Text>
              <View style={styles.ratingContainer}>
                <MaterialCommunityIcons name="star" size={16} color={Colors.dark} />
                <Text style={styles.ratingText}>{rating.toFixed(2)}</Text>
                <Text style={styles.photoHint}>• Modifier la photo</Text>
              </View>
            </View>
          </TouchableOpacity>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.availabilityCard}>
            <View style={styles.availabilityIcon}>
              <MaterialCommunityIcons
                name={online ? 'motorbike' : 'power-standby'}
                size={23}
                color={online ? '#24914C' : '#7B766D'}
              />
            </View>
            <View style={styles.availabilityCopy}>
              <Text style={styles.availabilityTitle}>Disponibilité</Text>
              <Text style={styles.availabilitySubtitle}>
                {online ? 'Vous pouvez recevoir des demandes' : 'Activez-vous pour recevoir des courses'}
              </Text>
            </View>
            <Switch
              value={online}
              onValueChange={setOnline}
              trackColor={{ false: '#D9D6CD', true: '#A6E0BA' }}
              thumbColor={online ? '#24914C' : '#F4F3EF'}
            />
          </View>

          {loading && (
            <View style={styles.feedbackCard}>
              <ActivityIndicator size="small" color={Colors.primaryDark} />
              <Text style={styles.feedbackText}>Mise à jour de votre profil...</Text>
            </View>
          )}
          {error && !loading && (
            <View style={[styles.feedbackCard, styles.errorCard]}>
              <Ionicons name="alert-circle-outline" size={20} color={Colors.error} />
              <Text style={[styles.feedbackText, styles.errorText]}>{error}</Text>
            </View>
          )}

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <MaterialCommunityIcons name="file-check-outline" size={23} color="#24914C" />
              <Text style={styles.summaryValue}>{validDocumentCount}/{documents.length}</Text>
              <Text style={styles.summaryLabel}>Documents validés</Text>
            </View>
            <View style={styles.summaryCard}>
              <MaterialCommunityIcons name="star-outline" size={23} color="#A87900" />
              <Text style={styles.summaryValue}>{rating.toFixed(2)}</Text>
              <Text style={styles.summaryLabel}>Note chauffeur</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Compte</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuRow} onPress={handleOpenPersonalInfo}>
              <View style={styles.menuIconBox}>
                <MaterialCommunityIcons name="account-edit-outline" size={22} color={Colors.dark} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={styles.menuText}>Informations personnelles</Text>
                <Text style={styles.menuSubText}>Nom, téléphone et informations du compte</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#9C978C" />
            </TouchableOpacity>
            <View style={styles.separator} />
            <TouchableOpacity style={styles.menuRow} onPress={handleOpenVehicle}>
              <View style={styles.menuIconBox}>
                <MaterialCommunityIcons name="motorbike" size={22} color={Colors.dark} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={styles.menuText}>Mon véhicule</Text>
                <Text style={styles.menuSubText}>Caractéristiques et immatriculation</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#9C978C" />
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>Documents chauffeur</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{validDocumentCount} validé{validDocumentCount > 1 ? 's' : ''}</Text>
            </View>
          </View>
          <View style={styles.menuCard}>
            {documents.map((doc, index) => {
              const { icon, color } = getStatusStyle(doc.status);
              return (
                <React.Fragment key={doc.key}>
                  <TouchableOpacity style={styles.menuRow} onPress={() => handleOpenDocument(doc)}>
                    <View style={[styles.menuIconBox, { backgroundColor: `${color}16` }]}>
                      <MaterialCommunityIcons name={icon} size={22} color={color} />
                    </View>
                    <View style={styles.menuCopy}>
                      <Text style={styles.menuText}>{doc.name}</Text>
                      <Text style={[styles.docStatus, { color }]}>{doc.expiry}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={19} color="#9C978C" />
                  </TouchableOpacity>
                  {index < documents.length - 1 && <View style={styles.separator} />}
                </React.Fragment>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Préférences et assistance</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuRow} onPress={handleChooseNavPref}>
              <View style={styles.menuIconBox}>
                <MaterialCommunityIcons name="navigation-variant-outline" size={22} color={Colors.dark} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={styles.menuText}>Application de navigation</Text>
                <Text style={styles.menuSubText}>{navPrefLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#9C978C" />
            </TouchableOpacity>
            <View style={styles.separator} />
            <TouchableOpacity style={styles.menuRow} onPress={handleOpenHelp}>
              <View style={styles.menuIconBox}>
                <MaterialCommunityIcons name="help-circle-outline" size={22} color={Colors.dark} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={styles.menuText}>Aide et support</Text>
                <Text style={styles.menuSubText}>Besoin d'aide avec l'application</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#9C978C" />
            </TouchableOpacity>
          </View>

          {validDocumentCount < documents.length && (
            <TouchableOpacity style={styles.completionCard} onPress={() => router.push('/become-driver')}>
              <View style={styles.completionIcon}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={24} color={Colors.dark} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={styles.completionTitle}>Compléter mon dossier</Text>
                <Text style={styles.completionSubtitle}>Ajoutez les éléments manquants à votre profil chauffeur</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color={Colors.dark} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.logoutButton, logoutLoading && styles.disabledButton]}
            onPress={handleLogout}
            disabled={logoutLoading}
          >
            {logoutLoading
              ? <ActivityIndicator size="small" color={Colors.error} />
              : <MaterialCommunityIcons name="logout" size={22} color={Colors.error} />}
            <Text style={styles.logoutText}>{logoutLoading ? 'Déconnexion...' : 'Se déconnecter'}</Text>
          </TouchableOpacity>

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
                    },
                  },
                ],
              );
            }}
            style={styles.deleteButton}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={17} color="#98938A" />
            <Text style={styles.deleteText}>Supprimer mon compte</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleDevTrigger} activeOpacity={1} style={styles.versionButton}>
            <Text style={styles.versionText}>v1.2.0 • Kêkênon Zem</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F3E9',
  },
  pageContent: {
    paddingBottom: 116,
  },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 285,
    paddingHorizontal: 21,
    paddingBottom: 42,
  },
  watermark: {
    position: 'absolute',
    width: 270,
    height: 270,
    right: -72,
    bottom: -88,
    opacity: 0.08,
    tintColor: Colors.dark,
    transform: [{ rotate: '-10deg' }],
  },
  heroHeading: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: 'rgba(26,26,26,0.62)',
  },
  heroTitle: {
    marginTop: 1,
    fontFamily: Fonts.bold,
    fontSize: 30,
    lineHeight: 35,
    color: Colors.dark,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  offlineBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#24914C',
  },
  offlineDot: {
    backgroundColor: '#8B8370',
  },
  onlineBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.dark,
  },
  identityRow: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 31,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: '#E8DDA8',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark,
  },
  avatarInitials: {
    fontFamily: Fonts.bold,
    fontSize: 31,
    color: Colors.white,
  },
  photoLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  editIconBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  identityCopy: {
    flex: 1,
    marginLeft: 16,
  },
  driverName: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    color: Colors.dark,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },
  ratingText: {
    marginLeft: 5,
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.dark,
  },
  photoHint: {
    marginLeft: 5,
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: 'rgba(26,26,26,0.62)',
  },
  content: {
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 17,
  },
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -24,
    marginBottom: 14,
    padding: 14,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E9E4D7',
    backgroundColor: Colors.white,
    shadowColor: '#493B13',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 11,
    elevation: 4,
  },
  availabilityIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F1EA',
  },
  availabilityCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  availabilityTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.dark,
  },
  availabilitySubtitle: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: '#7E796F',
  },
  feedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: '#FFF5C4',
  },
  feedbackText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: '#6C5B19',
  },
  errorCard: {
    backgroundColor: '#FDECEA',
  },
  errorText: {
    color: '#963E35',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 11,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    minHeight: 116,
    padding: 15,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E9E4D7',
    backgroundColor: Colors.white,
  },
  summaryValue: {
    marginTop: 8,
    fontFamily: Fonts.bold,
    fontSize: 21,
    color: Colors.dark,
  },
  summaryLabel: {
    marginTop: 1,
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: '#7D786F',
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.dark,
    marginBottom: 9,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionBadge: {
    marginBottom: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#E7F6EC',
  },
  sectionBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: '#237E46',
  },
  menuCard: {
    overflow: 'hidden',
    marginBottom: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E9E4D7',
    backgroundColor: Colors.white,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  menuIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#FFF2B5',
  },
  menuCopy: {
    flex: 1,
  },
  menuText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  menuSubText: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: '#888278',
  },
  separator: {
    height: 1,
    marginLeft: 68,
    backgroundColor: '#EFEBE1',
  },
  docStatus: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
  },
  completionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    padding: 15,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  completionIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  completionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.dark,
  },
  completionSubtitle: {
    marginTop: 2,
    fontFamily: Fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(26,26,26,0.66)',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: 52,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#F3CBC7',
    backgroundColor: '#FFF7F6',
  },
  disabledButton: {
    opacity: 0.6,
  },
  logoutText: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.error,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 19,
  },
  deleteText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: '#98938A',
  },
  versionButton: {
    alignItems: 'center',
    marginTop: 20,
  },
  versionText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: '#98938A',
  },
});
