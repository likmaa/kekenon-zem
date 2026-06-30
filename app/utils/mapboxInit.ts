// Mapbox is initialized ONCE here — prevents repeated setAccessToken calls that
// trigger mapbox-common internals (including LifecycleMonitorAndroid re-checks).
import Mapbox from '@rnmapbox/maps';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (!token) {
  console.error('[mapboxInit] EXPO_PUBLIC_MAPBOX_TOKEN is not set');
}
Mapbox.setAccessToken(token ?? '');

export { Mapbox };
