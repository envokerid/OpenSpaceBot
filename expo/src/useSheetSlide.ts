import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, PanResponder } from 'react-native';

type SheetSwipe = { enabled: boolean; height: number; onClose: () => void };

/** Keep the sheet mounted until its exit has finished. */
export function useSheetSlide(enabled: boolean, closing: boolean, onDismiss?: () => void, swipe?: SheetSwipe) {
  const progress = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  const [shown, setShown] = useState(false);
  const dismissed = useRef(onDismiss);
  dismissed.current = onDismiss;
  const ready = useRef(false);
  const reducedMotion = useRef(false);
  const snapAnimation = useRef<Animated.CompositeAnimation | undefined>(undefined);
  const latest = useRef({ enabled, closing, swipe });
  latest.current = { enabled, closing, swipe };

  const pan = useMemo(() => {
    const restore = () => {
      if (latest.current.closing) return;
      snapAnimation.current = Animated.timing(progress, {
        toValue: 0, duration: reducedMotion.current ? 0 : 180,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      });
      snapAnimation.current.start(({ finished }) => { ready.current = finished; });
    };
    return PanResponder.create({
      // Empty header space must own the initial native touch; waiting only
      // for a move leaves Android without a responder to deliver it to.
      // Header buttons still claim their own taps before this bubbling handler.
      onStartShouldSetPanResponder: () => Boolean(
        latest.current.enabled && latest.current.swipe?.enabled && !latest.current.closing && ready.current,
      ),
      onMoveShouldSetPanResponderCapture: (_, gesture) => Boolean(
        latest.current.enabled && latest.current.swipe?.enabled && !latest.current.closing && ready.current
        && gesture.numberActiveTouches === 1 && gesture.dy > 6 && gesture.dy > Math.abs(gesture.dx),
      ),
      onPanResponderGrant: () => {
        ready.current = false;
        progress.stopAnimation();
        Keyboard.dismiss();
      },
      onPanResponderMove: (_, gesture) => {
        if (latest.current.closing) return;
        progress.setValue(Math.min(1, Math.max(0, gesture.dy) / Math.max(1, latest.current.swipe?.height ?? 1)));
      },
      onPanResponderRelease: (_, gesture) => {
        if (latest.current.closing) return;
        const current = latest.current.swipe;
        if (current?.enabled && (gesture.dy > 100 || (gesture.dy > 24 && gesture.vy > 0.6))) current.onClose();
        else restore();
      },
      onPanResponderTerminate: restore,
      onPanResponderTerminationRequest: () => false,
    });
  }, [progress]);

  useEffect(() => () => snapAnimation.current?.stop(), []);

  useEffect(() => {
    if (!enabled || (!shown && !closing)) return;
    ready.current = false;
    snapAnimation.current?.stop();
    let disposed = false;
    let animation: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(reduced => {
      if (disposed) return;
      reducedMotion.current = reduced;
      animation = Animated.timing(progress, {
        toValue: closing ? 1 : 0,
        duration: reduced ? 0 : closing ? 220 : 300,
        easing: closing ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      animation.start(({ finished }) => {
        if (finished && !closing && !disposed) ready.current = true;
        if (finished && closing && !disposed) dismissed.current?.();
      });
    });
    return () => { disposed = true; animation?.stop(); };
  }, [enabled, shown, closing, progress]);

  return { progress, onShow: () => setShown(true), panHandlers: pan.panHandlers };
}
