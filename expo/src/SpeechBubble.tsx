import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View, type GestureResponderEvent } from 'react-native';
import { useTheme } from './ui';
import { GoalGradient } from './Goal';

// Transcript geometry never animates. In particular, recycled history rows
// occupy their full height on their first layout, without a measurement pass.
export function SpeechBubble({ children, mine, goal = false, fullWidth = false, onLongPress, onEnter }: React.PropsWithChildren<{ mine: boolean; goal?: boolean; fullWidth?: boolean; onLongPress: (event: GestureResponderEvent) => void; onEnter?: () => boolean }>) {
 const c = useTheme();
 const [enter] = useState(() => onEnter?.() ?? false);
 const progress = useRef(new Animated.Value(enter ? 0 : 1)).current;
 useEffect(() => {
   if (!enter) return;
   let disposed = false;
   const animation = Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true });
   const finish = () => { animation.stop(); progress.setValue(1); };
   const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => { if (reduced) { disposed = true; finish(); } });
   void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
     if (!disposed) { if (reduced) finish(); else animation.start(); }
   }).catch(finish);
   return () => { disposed = true; animation.stop(); motion.remove(); };
 }, [enter, progress]);
 return <Animated.View style={{ alignSelf: fullWidth ? 'stretch' : mine ? 'flex-end' : 'flex-start', maxWidth: '100%', marginLeft: !fullWidth && mine ? 56 : 0, marginRight: fullWidth || mine ? 0 : 44, marginBottom: 8, opacity: progress, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [mine ? 40 : -40, 0] }) }] }}>
   <Pressable onLongPress={onLongPress} delayLongPress={450}><View style={{ paddingHorizontal: 15, paddingVertical: 11, gap: 4, borderRadius: 20, backgroundColor: goal ? '#285FCC' : mine ? c.mine : c.bubble, ...(goal ? { overflow: 'hidden' } : {}) }}>{goal && <GoalGradient />}{children}</View></Pressable>
 </Animated.View>;
}
