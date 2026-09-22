import { useCallback, useEffect, useRef } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { ChatScrollPosition } from './core/chatScroll';

// Following the conversation is user intent. Content growth and keyboard
// resizing also emit scroll events, but must not turn following off.
export function useChatScroll<T>(conversation: string, around?: string) {
  const list = useRef<FlatList<T>>(null);
  const position = useRef(new ChatScrollPosition()).current;
  const frame = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const scroll = useCallback(() => {
    if (frame.current !== null || !position.following || position.interacting) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const offset = position.target();
      if (offset === undefined) return;
      // Use measured content (including the streaming footer and padding),
      // rather than FlatList's estimated last row position.
      list.current?.scrollToOffset({ offset, animated: false });
    });
  }, [position]);
  const pause = useCallback(() => { position.following = false; cancel(); }, [cancel, position]);
  const follow = useCallback(() => {
    position.following = true;
    position.interacting = false;
    scroll();
  }, [scroll, position]);

  useEffect(() => {
    position.following = !around;
    position.interacting = false;
    scroll();
    return cancel;
  }, [conversation, around, scroll, cancel, position]);

  const recordPosition = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentSize, contentOffset, layoutMeasurement } = event.nativeEvent;
    position.record(contentOffset.y, contentSize.height, layoutMeasurement.height);
  };
  const begin = () => { cancel(); position.interacting = true; };
  const end = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    recordPosition(event);
    position.interacting = false;
    // Do not snap on release. Following applies to the next content/viewport
    // change, not to where the user just chose to leave the conversation.
  };

  return {
    list, follow, pause, scroll,
    scrollProps: {
      onScrollBeginDrag: begin,
      onMomentumScrollBegin: begin,
      onScrollEndDrag: end,
      onMomentumScrollEnd: end,
      onScroll: recordPosition,
      scrollEventThrottle: 16,
      onLayout: (event: { nativeEvent: { layout: { height: number } } }) => {
        const height = event.nativeEvent.layout.height;
        if (position.viewportHeight === height) return;
        position.viewportHeight = height;
        scroll();
      },
      onContentSizeChange: (_width: number, height: number) => {
        if (position.contentHeight === height) return;
        position.contentHeight = height;
        scroll();
      },
    },
  };
}
