import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { GroupGoalRunCardData, GroupGoalRunStatus } from '../../shared/group-goal-run';
import { Label } from './ui';

// Crossfade two opposite gradients without animating transcript geometry.
export function GoalGradient() {
  const id = useId().replace(/:/g, '');
  const progress = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let alive = true;
    // Subscribe directly on web: RN Web keys accessibility listeners by the
    // callback's string representation, so separate mounted bubbles can collide.
    const media = Platform.OS === 'web' && typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
    const updateMedia = () => { if (media) setReduced(media.matches); };
    let motion: { remove: () => void } | undefined;
    if (media) { updateMedia(); media.addEventListener('change', updateMedia); }
    else {
      void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => {});
      motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    }
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { alive = false; motion?.remove(); media?.removeEventListener('change', updateMedia); app.remove(); };
  }, []);
  useEffect(() => {
    if (reduced || !foreground) return;
    const phase = (toValue: number) => Animated.timing(progress, { toValue, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false });
    const animation = Animated.loop(Animated.sequence([phase(1), phase(0)]));
    animation.start();
    return () => { animation.stop(); progress.setValue(0); };
  }, [reduced, foreground, progress]);
  const gradient = (reverse: boolean) => <Svg width="100%" height="100%">
    <Defs><LinearGradient id={`${id}-${reverse}`} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor={reverse ? '#7834C6' : '#285FCC'} />
      <Stop offset="1" stopColor={reverse ? '#285FCC' : '#7834C6'} />
    </LinearGradient></Defs>
    <Rect width="100%" height="100%" fill={`url(#${id}-${reverse})`} />
  </Svg>;
  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
    {gradient(false)}
    <Animated.View testID="goal-gradient-motion" style={[StyleSheet.absoluteFill, { opacity: progress }]}>{gradient(true)}</Animated.View>
  </View>;
}

const statuses: Record<GroupGoalRunStatus, string> = {
  working: 'In motion', completed: 'Goal reached', 'needs-input': 'Your input needed',
  blocked: 'Blocked', 'limit-reached': 'Turn limit reached', paused: 'Paused', stopped: 'Stopped', failed: 'Failed',
};

export function GoalHeading({ run }: { run?: GroupGoalRunCardData }) {
  return <Label size={13} bold style={{ color: '#FFFFFF', marginBottom: 2 }}>Goal{run ? ` · ${statuses[run.status]}` : ''}</Label>;
}

export function GoalProgress({ run }: { run: GroupGoalRunCardData }) {
  const turn = Math.min(run.maxTurns, run.turnCount + (run.status === 'working' ? 1 : 0));
  return <View style={{ gap: 6 }}>
    <Label size={17} selectable style={{ color: '#FFFFFF' }}>{run.goal}</Label>
    {!!run.detail && <Label size={14} selectable style={{ color: '#FFFFFF' }}>{run.detail}</Label>}
    <Label size={12} style={{ color: '#FFFFFF', opacity: 0.85 }}>{`${run.coordinatorName} coordinating · Turn ${turn} of ${run.maxTurns}`}</Label>
  </View>;
}
