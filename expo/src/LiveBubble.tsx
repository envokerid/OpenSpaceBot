import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { Avatar } from './Avatar';
import type { Client } from './core/client';

// Partial text stays in the session buffer. Only completed messages belong in
// the transcript, so the working avatar keeps the same footprint throughout a reply.
export const LiveBubble = React.memo(function LiveBubble({ bot, client, visible }: { bot: React.ComponentProps<typeof Avatar>['bot']; client: Client; visible: boolean }) {
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
  return <Animated.View pointerEvents="none" accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={{ height: space }}>
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, opacity, transform: [{ translateX: opacity.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}>
      <View accessible accessibilityLabel={`${bot.name} is working`} accessibilityLiveRegion="polite">
        <Avatar bot={bot} client={client} size={44} animated={visible} />
      </View>
    </Animated.View>
  </Animated.View>;
});
