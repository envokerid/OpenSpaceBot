import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { Label, useTheme } from './ui';

export function RosterHydration({ ready, connecting, children }: React.PropsWithChildren<{ ready: boolean; connecting: boolean }>) {
  const c = useTheme();
  const reveal = useRef(new Animated.Value(ready ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(.65)).current;
  const [skeleton, setSkeleton] = useState(!ready);
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let disposed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (!disposed) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', value => setActive(value === 'active'));
    return () => { disposed = true; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (!ready) { reveal.setValue(0); setSkeleton(true); return; }
    if (reduced || !active) { reveal.setValue(1); setSkeleton(false); return; }
    const animation = Animated.timing(reveal, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) setSkeleton(false); });
    return () => animation.stop();
  }, [ready, reduced, active, reveal]);
  useEffect(() => {
    pulse.setValue(.65);
    if (ready || reduced || !active || !connecting) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: .5, duration: 850, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [ready, reduced, active, connecting, pulse]);
  const block = (width: number | `${number}%`, height: number, round = 6) => <View style={{ width, height, borderRadius: round, backgroundColor: c.muted + '24' }} />;

  return <View>
    {ready && <Animated.View style={{ opacity: reveal }}>{children}</Animated.View>}
    {skeleton && <Animated.View pointerEvents="none" accessible={!ready} accessibilityLabel={connecting ? 'Loading groups and bots' : 'Waiting to load groups and bots'} accessibilityState={{ busy: connecting }}
      style={[ready ? StyleSheet.absoluteFill : undefined, { opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Label size={13} bold muted style={{ paddingHorizontal: 20, letterSpacing: .4 }}>GROUPS</Label>
        <Animated.View style={{ opacity: pulse }}>
          {[0, 1].map(i => <View key={i} style={{ minHeight: 76, paddingLeft: 16, paddingRight: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {block(52, 52, 26)}<View style={{ flex: 1, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{block(i ? '44%' : '57%', 16)}{block(38, 10)}</View>
              {block(i ? '85%' : '72%', 13)}
            </View>
          </View>)}
        </Animated.View>
        <View style={{ paddingTop: 18, paddingBottom: 4 }}><Label size={13} bold muted style={{ paddingHorizontal: 20, letterSpacing: .4 }}>BOTS</Label></View>
        <Animated.View style={{ opacity: pulse }}>
          {[0, 1, 2, 3, 4, 5].map(i => <View key={i} style={{ height: 76, paddingLeft: 16, paddingRight: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {block(52, 52, 26)}<View style={{ flex: 1, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{block(i % 2 ? '44%' : '57%', 16)}{block(38, 10)}</View>
              {block(i % 2 ? '85%' : '72%', 13)}
            </View>
          </View>)}
        </Animated.View>
      </View>
    </Animated.View>}
  </View>;
}
