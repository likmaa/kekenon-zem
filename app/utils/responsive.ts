import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');

export const isTablet = SCREEN_W >= 600;
export const CONTENT_MAX_WIDTH = Math.min(SCREEN_W, 640);

export const centeredContainer = {
  maxWidth: CONTENT_MAX_WIDTH,
  width: '100%' as const,
  alignSelf: 'center' as const,
};

const BASE_WIDTH = 375;
export function sp(size: number): number {
  const scale = SCREEN_W / BASE_WIDTH;
  const clampedScale = Math.min(scale, 1.3);
  return Math.round(PixelRatio.roundToNearestPixel(size * clampedScale));
}

export function fs(size: number): number {
  if (!isTablet) return size;
  return Math.round(size * 1.15);
}
