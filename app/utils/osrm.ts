import { apiFetch } from './apiClient';

export type LatLng = { latitude: number; longitude: number };

export async function fetchRouteOSRM(origin: LatLng, destination: LatLng): Promise<LatLng[]> {
  try {
    const res = await apiFetch('/routing/estimate', {
      method: 'POST',
      skipAuth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup: { lat: origin.latitude, lng: origin.longitude },
        dropoff: { lat: destination.latitude, lng: destination.longitude },
      }),
    });
    if (!res?.ok) return [];
    const data = await res.json().catch(() => null);
    const coords: [number, number][] = data?.geometry?.coordinates || [];
    return coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  } catch {
    return [];
  }
}
