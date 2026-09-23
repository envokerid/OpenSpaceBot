import React, { useEffect, useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

// Keep editing local: a keystroke should not rebuild the transcript. Use RN's
// controlled-value/event-count synchronization, never imperative native text
// writes competing with the keyboard when a command changes composer layout.
// Parent changes (send completion, dictation, commands) still replace the text.
export const ComposerInput = React.memo(function ComposerInput({ value = '', revision, onChangeText, ...props }: TextInputProps & { revision: number }) {
  const [text, setText] = useState(value);
  const local = useRef(value);
  const previousRevision = useRef(revision);
  const emitted = useRef(new Set<string>());
  useEffect(() => {
    if (previousRevision.current === revision && emitted.current.has(value)) {
      if (local.current === value) emitted.current.clear();
      return;
    }
    previousRevision.current = revision;
    emitted.current.clear();
    local.current = value;
    setText(value);
  }, [value, revision]);
  return <TextInput {...props} value={text} onChangeText={next => {
    emitted.current.add(next);
    local.current = next;
    setText(next);
    onChangeText?.(next);
  }} />;
});
