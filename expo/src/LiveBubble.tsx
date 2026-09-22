import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, View } from 'react-native';
import { SpeechBubble } from './SpeechBubble';
import { useTheme } from './ui';

const phases = Array.from({ length: 21 }, (_, i) => i / 20);
const pulses = [0, .2, .4].map(delay => phases.map(phase => (1 - Math.cos((phase - delay) * Math.PI * 2)) / 2));

// Partial text stays in the session buffer. Only completed messages belong in
// the transcript, so the typing bubble keeps the same size throughout a reply.
export const LiveBubble = React.memo(function LiveBubble({ name, color, visible }: { name: string; color: string; visible: boolean }) {
  const c = useTheme();
  const phase = useRef(new Animated.Value(0)).current;
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
  return <SpeechBubble visible={visible} onEnter={() => true} mine={false} onLongPress={() => {}}>
    <View accessible accessibilityLabel={`${name} is typing`} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', height: 20, gap: 6 }}>
      {pulses.map((pulse, i) => <Animated.View key={i} style={{
        width: 8, height: 8, borderRadius: 4, backgroundColor: color || c.accent,
        opacity: moving ? phase.interpolate({ inputRange: phases, outputRange: pulse.map(value => .35 + value * .65) }) : .6,
        transform: [{ translateY: moving ? phase.interpolate({ inputRange: phases, outputRange: pulse.map(value => -3 * value) }) : 0 }],
      }} />)}
    </View>
  </SpeechBubble>;
});
