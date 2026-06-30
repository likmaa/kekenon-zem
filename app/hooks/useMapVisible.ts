import { useState, useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

// Unmounts MapView before:
//   1. Screen loses navigation focus (iOS setHandledMapChangedEvents crash)
//   2. App goes to background (Android SavedStateRegistry ANR + LifecycleMonitorAndroid ANR)
export function useMapVisible(): boolean {
  const [navFocused, setNavFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => setNavFocused(true), 50);
      return () => {
        setNavFocused(false);
        clearTimeout(t);
      };
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
    });
    return () => sub.remove();
  }, []);

  return navFocused && appActive;
}
