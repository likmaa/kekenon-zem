import React from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAB_BAR_MARGIN = 16;
const TAB_BAR_WIDTH = SCREEN_WIDTH - TAB_BAR_MARGIN * 2;
const BAR_HEIGHT = 56;
const POKE = 32; // hauteur au-dessus de la barre où le cercle émerge
const CORNER = 26;
const CIRCLE = 46;
const NOTCH_GAP = 4; // jeu entre le cercle de l'icône et le bord du creux
const NOTCH_R = CIRCLE / 2 + NOTCH_GAP; // rayon du creux : épouse le cercle
const BAR_COLOR = '#FDD835';

const TAB_ORDER = ['index', 'wallet/index', 'stats/index', 'profile/index'];

const TAB_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { icon: 'home', label: 'Accueil' },
  'wallet/index': { icon: 'wallet-outline', label: 'Portefeuille' },
  'stats/index': { icon: 'stats-chart', label: 'Stats' },
  'profile/index': { icon: 'person', label: 'Profil' },
};

const SPRING = { damping: 16, stiffness: 140, mass: 0.6 };
const CLAMP_MIN = CORNER + NOTCH_R;
const CLAMP_MAX = TAB_BAR_WIDTH - CORNER - NOTCH_R;

/**
 * Barre d'onglets Kêkênon (jaune) : un creux se forme sous l'onglet actif et
 * son icône flotte dans un cercle de la même couleur que la barre. Le creux est
 * borné pour ne jamais déborder sur les coins arrondis.
 */
export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const routeByName = Object.fromEntries(state.routes.map((r) => [r.name, r]));
  const tabs = TAB_ORDER.map((name) => routeByName[name]).filter(Boolean);
  const count = tabs.length || 1;
  const slot = TAB_BAR_WIDTH / count;
  const centerFor = (i: number) => Math.min(Math.max(slot * i + slot / 2, CLAMP_MIN), CLAMP_MAX);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((r) => r && state.routes[state.index]?.key === r.key),
  );

  const cx = useSharedValue(centerFor(activeIndex));

  React.useEffect(() => {
    cx.value = withSpring(centerFor(activeIndex), SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, count]);

  const pathProps = useAnimatedProps(() => {
    const x = cx.value;
    const W = TAB_BAR_WIDTH;
    const H = BAR_HEIGHT;
    const R = NOTCH_R;
    const k = 0.5523; // constante de bézier pour approcher un arc de cercle
    return {
      d:
        `M 0 ${CORNER}` +
        ` Q 0 0 ${CORNER} 0` +
        // demi-cercle qui épouse le cercle de l'icône (berceau rond)
        ` L ${x - R} 0` +
        ` C ${x - R} ${R * k} ${x - R * k} ${R} ${x} ${R}` +
        ` C ${x + R * k} ${R} ${x + R} ${R * k} ${x + R} 0` +
        ` L ${W - CORNER} 0` +
        ` Q ${W} 0 ${W} ${CORNER}` +
        ` L ${W} ${H - CORNER}` +
        ` Q ${W} ${H} ${W - CORNER} ${H}` +
        ` L ${CORNER} ${H}` +
        ` Q 0 ${H} 0 ${H - CORNER}` +
        ` Z`,
    };
  });

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cx.value - CIRCLE / 2 }],
  }));

  const activeMeta = TAB_META[tabs[activeIndex]?.name] ?? { icon: 'ellipse' as const, label: '' };

  return (
    <View style={[styles.container, { bottom: Math.max(insets.bottom, 16) }]}>
      <Svg width={TAB_BAR_WIDTH} height={BAR_HEIGHT} style={styles.svg}>
        <AnimatedPath animatedProps={pathProps} fill={BAR_COLOR} />
      </Svg>

      {/* Icône active flottante — même couleur que la barre */}
      <Animated.View style={[styles.floating, circleStyle]} pointerEvents="none">
        <View style={styles.floatingCircle}>
          <Ionicons name={activeMeta.icon} size={23} color="#1A1A1A" />
        </View>
      </Animated.View>

      {/* Rangée d'onglets */}
      <View style={styles.row}>
        {tabs.map((route, i) => {
          const meta = TAB_META[route.name];
          const isFocused = i === activeIndex;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };
          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={meta?.label}
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              {isFocused ? null : (
                <Ionicons name={meta?.icon ?? 'ellipse'} size={24} color="rgba(26,26,26,0.55)" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: TAB_BAR_MARGIN,
    right: TAB_BAR_MARGIN,
    height: BAR_HEIGHT + POKE,
    paddingTop: POKE,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },
  svg: { position: 'absolute', top: POKE, left: 0 },
  row: { flexDirection: 'row', height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'space-around' },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  floating: {
    position: 'absolute',
    top: POKE - CIRCLE / 2, // cercle concentrique au creux : jeu uniforme tout autour
    left: 0,
    width: CIRCLE,
    alignItems: 'center',
  },
  floatingCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: BAR_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
