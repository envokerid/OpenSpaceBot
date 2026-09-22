import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View, type GestureResponderEvent } from 'react-native';
import { useTheme } from './ui';

export function SpeechBubble({ children, mine, onLongPress, onEnter, visible = true }: React.PropsWithChildren<{ mine: boolean; onLongPress: (event: GestureResponderEvent) => void; onEnter?: () => boolean; visible?: boolean }>) {
 const c = useTheme(); const [size, setSize] = useState({ width: 0, height: 0 }); const { width: w, height: h } = size;
 const entrance = useRef(onEnter);
 const entered = useRef(false);
 // Retain a hidden typing bubble until its exit completes. Reversing visibility
 // cancels the current animation and continues from its current position.
 const [present, setPresent] = useState(visible);
 const progress = useRef(new Animated.Value(onEnter || !visible ? 0 : 1)).current;
 const ready = w > 0 && h > 0;
 useEffect(() => {
   if (visible && !present) { setPresent(true); return; }
   if (!present || !ready) return;
   const animate = !visible || entered.current || entrance.current?.();
   entered.current = true;
   if (!animate) { progress.setValue(1); return; }
   let disposed = false;
   const target = visible ? 1 : 0;
   const animation = Animated.timing(progress, { toValue: target, duration: visible ? 260 : 200, easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true });
   const finish = () => { animation.stop(); progress.setValue(target); if (!visible) setPresent(false); };
   const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => { if (reduced) { disposed = true; finish(); } });
   void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
     if (disposed) return;
     if (reduced) finish(); else animation.start(({ finished }) => { if (finished && !disposed && !visible) setPresent(false); });
   }).catch(() => { if (!disposed) finish(); });
   return () => { disposed = true; animation.stop(); motion.remove(); };
 }, [ready, progress, visible, present]);
 if (!present) return null;
 // Lay out the full text and background before revealing them together. Only position
 // and opacity animate: no scale, height tween or morph from the typing dots.
 return <Animated.View pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '100%', marginLeft: mine ? 56 : 0, marginRight: mine ? 0 : 44, marginBottom: 8, opacity: ready ? progress : 0, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [mine ? 40 : -40, 0] }) }] }}><Pressable onLongPress={onLongPress} delayLongPress={450}><View onLayout={e => setSize(e.nativeEvent.layout)} style={{ paddingHorizontal: 15, paddingVertical: 11, gap: 4, borderRadius: 20, backgroundColor: mine ? c.mine : c.bubble }}>
 {children}</View></Pressable></Animated.View>;
}
