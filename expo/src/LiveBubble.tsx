import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, View } from 'react-native';
import { useTheme } from './ui';

const phases = Array.from({ length: 21 }, (_, i) => i / 20);
const pulses = [0, .2, .4].map(delay => phases.map(phase => (1 - Math.cos((phase - delay) * Math.PI * 2)) / 2));

// Partial text stays in the session buffer. Only completed messages belong in
// the transcript, so the typing bubble keeps the same size throughout a reply.
export const LiveBubble = React.memo(function LiveBubble({ name, color, visible }: { name: string; color: string; visible: boolean }) {
  const c = useTheme();
  const phase = useRef(new Animated.Value(0)).current;
  const space = useRef(new Animated.Value(visible ? 50 : 0)).current;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { clearTimeout(timer); space.stopAnimation(); opacity.stopAnimation(); space.setValue(visible ? 50 : 0); opacity.setValue(visible ? 1 : 0); };
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => { if (reduced) { disposed = true; finish(); } });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (disposed) return;
      if (reduced) { finish(); return; }
      if (visible) {
        // Reserve this small, fixed footprint once. The scroll controller owns
        // movement into view; never animate the height of a completed reply.
        space.setValue(50);
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      } else {
        // A short handoff keeps its footprint. Let the reply's entrance/scroll
        // finish before releasing the typing space, and cancel on a new turn.
        timer = setTimeout(() => {
          Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start();
          Animated.timing(space, { toValue: 0, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        }, 280);
      }
    }).catch(() => { if (!disposed) finish(); });
    return () => { disposed = true; clearTimeout(timer); space.stopAnimation(); opacity.stopAnimation(); motion.remove(); };
  }, [visible, space, opacity]);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    let disposed = false, reduced = true, active = AppState.currentState === 'active';
    const loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    const update = () => {
      loop.stop(); phase.setValue(0);
      const live = visible && !disposed && !reduced && active;
      setMoving(live);
      if (live) loop.start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (!disposed) { reduced = value; update(); } });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduced = value; update(); });
    const app = AppState.addEventListener('change', value => { active = value === 'active'; update(); });
    return () => { disposed = true; loop.stop(); motion.remove(); app.remove(); };
  }, [phase, visible]);
  return <Animated.View pointerEvents="none" accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={{ height: space }}>
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 20, backgroundColor: c.bubble, opacity, transform: [{ translateX: opacity.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}>
    <View accessible accessibilityLabel={`${name} is typing`} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', height: 20, gap: 6 }}>
      {pulses.map((pulse, i) => <Animated.View key={i} style={{
        width: 8, height: 8, borderRadius: 4, backgroundColor: color || c.accent,
        opacity: moving ? phase.interpolate({ inputRange: phases, outputRange: pulse.map(value => .35 + value * .65) }) : .6,
        transform: [{ translateY: moving ? phase.interpolate({ inputRange: phases, outputRange: pulse.map(value => -3 * value) }) : 0 }],
      }} />)}
    </View>
  </Animated.View></Animated.View>;
});
