import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { resolveApiUrl } from '../utils/apiClient';
import { Colors } from '../../theme';

type AppKind = 'passenger' | 'driver';

const dismissStorageKey = (kind: AppKind) => `@tic_version_update_dismiss_${kind}`;

type VersionCheckJson = {
  force_update: boolean;
  update_recommended: boolean;
  latest_version: string;
  message: string | null;
  store_url: string | null;
};

function currentAppVersion(): string {
  const native = Constants.nativeAppVersion;
  if (native && typeof native === 'string' && native.length > 0) {
    return native;
  }
  return Constants.expoConfig?.version ?? '0.0.0';
}

export function AppUpdateGate({ app }: { app: AppKind }) {
  const [visible, setVisible] = useState(false);
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const latestRef = useRef<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      try {
        const version = currentAppVersion();
        const platform = Platform.OS === 'ios' ? 'ios' : 'android';
        const base = resolveApiUrl('/app/version-check');
        if (!base) {
          return;
        }
        const url = `${base}?${new URLSearchParams({
          app,
          version,
          platform,
        }).toString()}`;

        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as VersionCheckJson;
        latestRef.current = data.latest_version;

        if (data.force_update) {
          setForce(true);
          setMessage(data.message ?? 'Mise à jour obligatoire.');
          setStoreUrl(data.store_url);
          setVisible(true);
          return;
        }

        if (data.update_recommended) {
          const raw = await AsyncStorage.getItem(dismissStorageKey(app));
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as { latest?: string };
              if (parsed.latest === data.latest_version) {
                return;
              }
            } catch {
              /* ignore */
            }
          }
          setForce(false);
          setMessage(data.message ?? 'Mise à jour disponible.');
          setStoreUrl(data.store_url);
          setVisible(true);
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
          return;
        }
      }
    };

    void run();
    return () => ac.abort();
  }, [app]);

  const openStore = () => {
    if (storeUrl) {
      void Linking.openURL(storeUrl);
    }
  };

  const dismissSoft = async () => {
    const latest = latestRef.current;
    if (latest) {
      try {
        await AsyncStorage.setItem(dismissStorageKey(app), JSON.stringify({ latest }));
      } catch {
        /* ignore */
      }
    }
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={force ? undefined : dismissSoft}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{force ? 'Mise à jour requise' : 'Nouvelle version'}</Text>
          <Text style={styles.body}>{message}</Text>
          {storeUrl ? (
            <Pressable style={styles.primaryBtn} onPress={openStore}>
              <Text style={styles.primaryLabel}>Mettre à jour</Text>
            </Pressable>
          ) : (
            <Text style={styles.muted}>Lien store non configuré côté serveur.</Text>
          )}
          {!force && (
            <Pressable style={styles.secondaryBtn} onPress={() => void dismissSoft()}>
              <Text style={styles.secondaryLabel}>Plus tard</Text>
            </Pressable>
          )}
          {force && !storeUrl && (
            <View style={styles.spinnerWrap}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.black,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    color: Colors.gray,
    marginBottom: 18,
    lineHeight: 22,
  },
  muted: {
    fontSize: 13,
    color: Colors.gray,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryLabel: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  spinnerWrap: {
    marginTop: 12,
  },
});
