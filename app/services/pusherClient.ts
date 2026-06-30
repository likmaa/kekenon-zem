import AsyncStorage from '@react-native-async-storage/async-storage';
import Pusher from 'pusher-js/react-native';
import { getAuthToken, removeAuthToken } from '../utils/authTokenStorage';

let client: Pusher | null = null;
let currentToken: string | null = null;

const PUSHER_KEY = process.env.EXPO_PUBLIC_PUSHER_KEY ?? '';
const PUSHER_CLUSTER = process.env.EXPO_PUBLIC_PUSHER_CLUSTER ?? 'mt1';
const WS_HOST = process.env.EXPO_PUBLIC_PUSHER_HOST ?? '';
const WS_PORT = Number(process.env.EXPO_PUBLIC_PUSHER_PORT ?? '443');
const USE_TLS = (process.env.EXPO_PUBLIC_PUSHER_TLS ?? 'true') === 'true';

const apiBase = (() => {
  const raw = process.env.EXPO_PUBLIC_API_URL ?? '';
  return raw.replace(/\/api\/?$/, '');
})();

async function buildClient() {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Missing auth token for realtime communication');
  }

  if (client && currentToken === token) {
    return client;
  }

  if (client) {
    client.disconnect();
  }

  client = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    wsHost: WS_HOST,
    wsPort: WS_PORT,
    forceTLS: USE_TLS,
    enabledTransports: USE_TLS ? ['ws', 'wss'] : ['ws'],
    authEndpoint: `${apiBase}/broadcasting/auth`,
    auth: {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
    activityTimeout: 30000,
    pongTimeout: 10000,
  });

  currentToken = token;

  // Track connection state
  client.connection.bind('state_change', (states: { previous: string; current: string }) => {
    console.log(`[Pusher] State change: ${states.previous} -> ${states.current}`);
  });

  return client;
}

export async function getPusherClient(): Promise<Pusher> {
  return buildClient();
}

/**
 * Returns the current connection state of the Pusher client.
 * Possible values: 'initialized', 'connecting', 'connected', 'unavailable', 'failed', 'disconnected'
 */
export function getPusherConnectionState(): string {
  if (!client) return 'disconnected';
  return client.connection.state;
}

export function unsubscribeChannel(channel?: any) {
  if (client && channel?.name) {
    channel.unbind_all();
    client.unsubscribe(channel.name);
  }
}

export function disconnectPusher() {
  if (client) {
    client.disconnect();
    client = null;
    currentToken = null;
  }
}

