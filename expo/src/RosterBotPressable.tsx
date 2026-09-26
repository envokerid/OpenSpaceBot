import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

export function RosterBotPressable({ children, name, onPress, onMenu }: React.PropsWithChildren<{
  name: string; onPress: () => void; onMenu?: (anchor: { x: number; y: number }) => void;
}>) {
  const scale = useRef(new Animated.Value(1)).current;
  const reducedMotion = useRef(true);
  useEffect(() => {
    let disposed = false;
    const update = (reduced: boolean) => {
      reducedMotion.current = reduced;
      if (reduced) { scale.stopAnimation(); scale.setValue(1); }
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (!disposed) update(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { disposed = true; subscription.remove(); scale.stopAnimation(); };
  }, [scale]);

  const release = () => {
    scale.stopAnimation();
    if (reducedMotion.current) { scale.setValue(1); return; }
    Animated.spring(scale, { toValue: 1, stiffness: 280, damping: 20, mass: .7, useNativeDriver: true }).start();
  };
  const showMenu = (anchor: { x: number; y: number }) => {
    if (!onMenu) return;
    release();
    // Feedback must never delay or prevent opening the menu on unsupported devices.
    if (Platform.OS === 'android') {
      void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press).catch(() => {});
    } else if (Platform.OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onMenu(anchor);
  };

  return <Animated.View style={{ transform: [{ scale }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Chat with ${name}`}
      accessibilityHint={onMenu ? 'Hold to edit, rename, move to a section or delete this bot' : undefined}
      accessibilityActions={onMenu ? [{ name: 'longpress', label: 'Show bot actions' }] : undefined}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress') showMenu({ x: 24, y: 160 }); }}
      onPressIn={() => {
        if (!onMenu || reducedMotion.current) return;
        Animated.timing(scale, { toValue: .975, duration: 450, useNativeDriver: true }).start();
      }}
      onPressOut={release}
      onLongPress={onMenu ? event => showMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }) : undefined}
      delayLongPress={450} onPress={onPress}
      style={{ flexDirection: 'row', paddingLeft: 6, paddingRight: 16 }}>
      {children}
    </Pressable>
  </Animated.View>;
}
