import React, { useEffect, useRef, useState } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';

// Keep native editing local: a keystroke should not rebuild the transcript.
// Parent changes (send completion, dictation, commands) still replace the text.
export const ComposerInput = React.memo(function ComposerInput({ value = '', revision, onChangeText, ...props }: TextInputProps & { revision: number }) {
  const [text, setText] = useState(value);
  const input = useRef<TextInput>(null);
  const initial = useRef(value);
  const local = useRef(value);
  const previousRevision = useRef(revision);
  const emitted = useRef(new Set<string>());
  useEffect(() => {
    if (previousRevision.current === revision && emitted.current.has(value)) {
      if (local.current === value) emitted.current.clear();
      return;
    }
    const changed = local.current !== value;
    previousRevision.current = revision;
    emitted.current.clear();
    local.current = value;
    if (Platform.OS === 'web') setText(value);
    else if (changed) {
      if (value) input.current?.setNativeProps({ text: value });
      else input.current?.clear();
    }
  }, [value, revision]);
  return <TextInput {...props} ref={input} {...(Platform.OS === 'web' ? { value: text } : { defaultValue: initial.current })} onChangeText={next => {
    emitted.current.add(next);
    local.current = next;
    if (Platform.OS === 'web') setText(next);
    onChangeText?.(next);
  }} />;
});
