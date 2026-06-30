import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const KEY = 'authToken';

type SecureStoreShim = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

let secureStoreModule: SecureStoreShim | null | undefined;
let secureStoreNativeBroken = false;

function isExpoSecureStoreNativeLinked(): boolean {
  try {
    const nm = NativeModules as Record<string, unknown>;
    return nm != null && nm.ExpoSecureStore != null;
  } catch {
    return false;
  }
}

function getSecureStore(): SecureStoreShim | null {
  if (secureStoreNativeBroken) return null;
  if (secureStoreModule !== undefined) return secureStoreModule;
  if (!isExpoSecureStoreNativeLinked()) {
    secureStoreModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStoreModule = require('expo-secure-store') as SecureStoreShim;
    return secureStoreModule;
  } catch {
    secureStoreModule = null;
    return null;
  }
}

function markSecureStoreBroken(): void {
  secureStoreNativeBroken = true;
  secureStoreModule = null;
}

export async function getAuthToken(): Promise<string | null> {
  const SecureStore = getSecureStore();
  if (SecureStore) {
    try {
      const fromSecure = await SecureStore.getItemAsync(KEY);
      if (fromSecure) return fromSecure;
    } catch {
      markSecureStoreBroken();
    }
  }

  // Migration : ancien token en AsyncStorage → déplace dans SecureStore
  const legacy = await AsyncStorage.getItem(KEY);
  if (!legacy) return null;

  const S = getSecureStore();
  if (S) {
    try {
      await S.setItemAsync(KEY, legacy);
      await AsyncStorage.removeItem(KEY);
      return legacy;
    } catch {
      markSecureStoreBroken();
    }
  }

  return legacy;
}

export async function setAuthToken(token: string): Promise<void> {
  const SecureStore = getSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(KEY, token);
      await AsyncStorage.removeItem(KEY);
      return;
    } catch {
      markSecureStoreBroken();
    }
  }
  await AsyncStorage.setItem(KEY, token);
}

export async function removeAuthToken(): Promise<void> {
  const SecureStore = getSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      markSecureStoreBroken();
    }
  }
  await AsyncStorage.removeItem(KEY);
}
