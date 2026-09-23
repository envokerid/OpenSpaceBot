import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, type FlatList, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ChatScrollPosition } from './core/chatScroll';

const anchor = { minIndexForVisible: 0 };

// One controller owns bottom-following. Native anchoring preserves the reader's
// message when rows above it change; it never automatically scrolls to the top.
export function useChatScroll<T>(conversation: string, around?: string, visible = true, loaded = true) {
  const list = useRef<FlatList<T>>(null);
  const position = useRef(new ChatScrollPosition()).current;
  const frame = useRef<number | null>(null);
  const settled = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const initialized = useRef(false);
  const reduced = useRef(true);
  const instant = useRef(false);
  const lastTarget = useRef<number | undefined>(undefined);
  const screen = useRef({ visible, loaded }); screen.current = { visible, loaded };

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) reduced.current = value; }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      reduced.current = value;
      if (value && position.following && !position.interacting) {
        const offset = position.target();
        if (offset !== undefined) list.current?.scrollToOffset({ offset, animated: false });
      }
    });
    return () => { alive = false; subscription.remove(); };
  }, [position]);

  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const scroll = useCallback((immediate = false) => {
    if (!screen.current.visible || !position.following || position.interacting) return;
    instant.current ||= immediate;
    if (frame.current !== null) return;
    // Coalesce the row, composer and list measurements from the same commit.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const animate = initialized.current && !instant.current && !reduced.current;
        instant.current = false;
        if (!screen.current.visible) return;
        const offset = position.target();
        if (offset !== undefined && (offset !== lastTarget.current || !animate)) {
          lastTarget.current = offset;
          position.programmaticScroll();
          list.current?.scrollToOffset({ offset, animated: animate });
        }
        clearTimeout(settled.current);
        settled.current = setTimeout(() => { if (screen.current.loaded) initialized.current = true; }, 120);
      });
    });
  }, [position]);
  const pause = useCallback(() => { position.following = false; cancel(); }, [cancel, position]);
  const follow = useCallback(() => {
    position.following = true; position.interacting = false;
    position.programmaticScroll(); lastTarget.current = undefined;
    scroll();
  }, [scroll, position]);

  useEffect(() => {
    position.following = !around; position.interacting = false;
    initialized.current = false; lastTarget.current = undefined;
    return () => { cancel(); clearTimeout(settled.current); };
  }, [conversation, around, cancel, position]);
  useEffect(() => { if (visible && loaded) scroll(true); else cancel(); }, [visible, loaded, scroll, cancel]);

  const record = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentSize, contentOffset, layoutMeasurement } = event.nativeEvent;
    position.record(contentOffset.y, contentSize.height, layoutMeasurement.height);
  };
  const end = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    record(event); position.endDrag();
    // Never correct the reader's chosen position on release.
  };
  return {
    list, follow, pause, scroll,
    scrollProps: {
      maintainVisibleContentPosition: anchor,
      onScrollBeginDrag: () => { cancel(); lastTarget.current = undefined; position.beginDrag(); },
      onMomentumScrollBegin: () => { if (position.beginMomentum()) cancel(); },
      onScrollEndDrag: end,
      onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => { record(event); position.endMomentum(); },
      onScroll: record,
      scrollEventThrottle: 16,
      onLayout: (event: { nativeEvent: { layout: { height: number } } }) => {
        const height = event.nativeEvent.layout.height;
        if (position.viewportHeight === height) return;
        position.viewportHeight = height;
        scroll(true);
      },
      onContentSizeChange: (_width: number, height: number) => {
        if (position.contentHeight === height) return;
        const shrinking = height < position.contentHeight;
        position.contentHeight = height;
        // Typing exit already animates its small footprint. Do not start a
        // second native scroll animation against each of its shrinking frames.
        scroll(shrinking);
      },
    },
  };
}
