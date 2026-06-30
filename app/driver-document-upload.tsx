import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { apiFetch } from './utils/apiClient';

export default function DriverDocumentUploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string; name?: string; currentUrl?: string }>();
  const documentKey = String(params.key ?? 'document');
  const documentName = String(params.name ?? 'Document');
  const initialUrl = typeof params.currentUrl === 'string' ? params.currentUrl : '';

  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const previewUri = useMemo(() => selectedUri || initialUrl || null, [selectedUri, initialUrl]);

  const pickDocument = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'Autorisez l’accès aux photos pour sélectionner un document.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
      });
      if (result.canceled) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      setSelectedUri(uri);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de sélectionner le document.');
    }
  };

  const submitDocument = async () => {
    if (!selectedUri) {
      Alert.alert('Document requis', 'Sélectionne un document avant l’envoi.');
      return;
    }

    try {
      setUploading(true);
      const filename = selectedUri.split('/').pop() || `${documentKey}.jpg`;
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };

      const formData = new FormData();
      formData.append('document_key', documentKey);
      formData.append('name', documentName);
      formData.append('status', 'pending');
      formData.append('file', {
        uri: selectedUri,
        name: filename,
        type: mimeMap[ext] || 'image/jpeg',
      } as any);

      const res = await apiFetch('/driver/profile/documents', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const json = await res?.json().catch(() => null);
      if (!res || !res.ok) {
        Alert.alert('Erreur', json?.message || 'Impossible d’envoyer le document.');
        return;
      }

      Alert.alert(
        'Document envoyé',
        'Votre document est en cours de validation.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Échec de l’envoi du document.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Téléverser un document</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.docName}>{documentName}</Text>
        <Text style={styles.helper}>Choisis une photo claire, puis appuie sur “Envoyer le document”.</Text>

        <TouchableOpacity style={styles.previewCard} onPress={pickDocument} activeOpacity={0.8}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="cover" />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Ionicons name="image-outline" size={34} color={Colors.gray} />
              <Text style={styles.previewPlaceholderText}>Ajouter une image</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={pickDocument} disabled={uploading}>
          <Text style={styles.secondaryBtnText}>Choisir un document</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, (!selectedUri || uploading) && { opacity: 0.6 }]}
          onPress={submitDocument}
          disabled={!selectedUri || uploading}
        >
          {uploading ? <ActivityIndicator color="white" /> : <Text style={styles.primaryBtnText}>Envoyer le document</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: Fonts.titilliumWebBold, fontSize: 18, color: Colors.black },
  content: { padding: 20 },
  docName: { fontFamily: Fonts.titilliumWebBold, fontSize: 20, color: Colors.black },
  helper: { fontFamily: Fonts.titilliumWeb, fontSize: 14, color: Colors.gray, marginTop: 4, marginBottom: 16 },
  previewCard: {
    borderRadius: 16,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: Colors.lightGray,
    minHeight: 220,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: 280 },
  previewPlaceholder: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewPlaceholderText: { fontFamily: Fonts.titilliumWeb, fontSize: 14, color: Colors.gray },
  secondaryBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryBtnText: { fontFamily: Fonts.titilliumWebBold, fontSize: 15, color: Colors.primary },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontFamily: Fonts.titilliumWebBold, fontSize: 15, color: 'white' },
});
