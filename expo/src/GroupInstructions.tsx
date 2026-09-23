import React from 'react';
import { FormSection, Input, Label } from './ui';

export function GroupInstructions({ value, onChange, disabled = false }: {
  value: string; onChange?: (value: string) => void; disabled?: boolean;
}) {
  return <FormSection title="Group instructions" footer="Shared instructions for every bot when responding in this group.">
    {onChange ? <>
      <Input accessibilityLabel="Group instructions" multiline value={value} onChangeText={onChange}
        placeholder="Add roles, goals, tone, or rules for this group…" maxLength={12_000}
        editable={!disabled} style={{ minHeight: 144, maxHeight: 240 }} />
      <Label muted size={12} style={{ textAlign: 'right', paddingHorizontal: 4 }}>{value.length.toLocaleString()} / 12,000 characters</Label>
    </> : <Label muted selectable>{value || 'No group instructions.'}</Label>}
  </FormSection>;
}
