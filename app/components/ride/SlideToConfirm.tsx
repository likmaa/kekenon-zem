import React from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../theme';
import { Fonts } from '../../../font';

const KNOB_SIZE = 48;
const TRACK_PADDING = 4;
const CONFIRM_THRESHOLD = 0.72;

type Props = {
  label: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
};

export function SlideToConfirm({ label, onConfirm, disabled = false, loading = false }: Props) {
  const position = React.useRef(new Animated.Value(0)).current;
  const positionValue = React.useRef(0);
  const confirmedRef = React.useRef(false);
  const [trackWidth, setTrackWidth] = React.useState(0);
  const maxTravel = Math.max(0, trackWidth - KNOB_SIZE - TRACK_PADDING * 2);

  React.useEffect(() => {
    const listenerId = position.addListener(({ value }) => {
      positionValue.current = value;
    });
    return () => position.removeListener(listenerId);
  }, [position]);

  const reset = React.useCallback(() => {
    confirmedRef.current = false;
    Animated.spring(position, {
      toValue: 0,
      useNativeDriver: false,
      speed: 20,
      bounciness: 0,
    }).start();
  }, [position]);

  React.useEffect(() => {
    if (!loading) reset();
  }, [label, loading, reset]);

  const confirm = React.useCallback(async () => {
    if (disabled || loading || confirmedRef.current || maxTravel <= 0) return;
    confirmedRef.current = true;
    Animated.timing(position, {
      toValue: maxTravel,
      duration: 140,
      useNativeDriver: false,
    }).start();
    try {
      await onConfirm();
    } finally {
      reset();
    }
  }, [disabled, loading, maxTravel, onConfirm, position, reset]);

  const panResponder = React.useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => !disabled && !loading && gesture.dx > 4,
      onPanResponderGrant: () => {
        position.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        position.setValue(Math.max(0, Math.min(maxTravel, gesture.dx)));
      },
      onPanResponderRelease: () => {
        if (positionValue.current >= maxTravel * CONFIRM_THRESHOLD) {
          void confirm();
        } else {
          reset();
        }
      },
      onPanResponderTerminate: reset,
    }),
    [confirm, disabled, loading, maxTravel, position, reset],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const fillWidth = Animated.add(position, KNOB_SIZE + TRACK_PADDING * 2);

  return (
    <View
      style={[styles.track, disabled && styles.trackDisabled]}
      onLayout={handleLayout}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}. Faites glisser vers la droite pour confirmer.`}
      accessibilityActions={[{ name: 'activate', label: label }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') void confirm();
      }}
    >
      <Animated.View style={[styles.progress, { width: fillWidth }]} />

      <View style={styles.labelWrapper} pointerEvents="none">
        <Text style={styles.label}>{loading ? 'Confirmation…' : label}</Text>
        {!loading ? <Ionicons name="chevron-forward" size={17} color="rgba(255,255,255,0.55)" /> : null}
      </View>

      <Animated.View
        style={[styles.knob, { transform: [{ translateX: position }] }]}
        {...panResponder.panHandlers}
      >
        {loading ? (
          <ActivityIndicator size="small" color={Colors.dark} />
        ) : (
          <View style={styles.chevrons}>
            <Ionicons name="chevron-forward" size={19} color={Colors.dark} />
            <Ionicons name="chevron-forward" size={19} color={Colors.dark} style={styles.secondChevron} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 56,
    borderRadius: 18,
    padding: TRACK_PADDING,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(253,216,53,0.3)',
  },
  trackDisabled: { opacity: 0.5 },
  progress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 18,
    backgroundColor: 'rgba(253,216,53,0.2)',
  },
  labelWrapper: {
    position: 'absolute',
    left: KNOB_SIZE + 22,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.white,
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  chevrons: { flexDirection: 'row', alignItems: 'center' },
  secondChevron: { marginLeft: -10 },
});
