import React, { useEffect, useRef, useState } from "react";
import { Switch, View } from "react-native";
import type { Client } from "../core/client";
import {
  Button,
  Choice,
  ErrorNotice,
  Input,
  Label,
  Row,
  Section,
  useAction,
} from "../ui";

export interface WorkspaceConfig {
  profile?: { name: string; email: string };
  language?: string;
  rooms?: { turnTimeoutMinutes: number };
  threads?: { maxConcurrentPerBot: number };
  features?: Record<string, boolean>;
  browserProfiles?: { id: string; name: string }[];
  browserEngine?: { kind: string; reason?: string; installable?: boolean };
  localVm?: { mode: string; maxInstances: number };
  anthropic?: { configured: boolean };
  openaiCompat?: { configured: boolean; url?: string };
  xai?: { configured: boolean };
  box?: { configured: boolean };
  opencodeGo?: { configured: boolean };
  composio?: { configured: boolean; mode?: string };
  vps?: { configured: boolean; sshAlias?: string };
  tts?: {
    configured: boolean;
    provider?: string;
    voice?: string;
    baseUrl?: string;
    model?: string;
  };
  imageGen?: {
    configured: boolean;
    provider?: string;
    model?: string;
    customUrl?: string;
    customModel?: string;
    openaiConfigured?: boolean;
    xaiConfigured?: boolean;
    customKeyConfigured?: boolean;
  };
  signIn?: { admins?: string[]; members?: string[] };
  budgets?: { monthlyUsd?: number; warnAtPercent?: number };
  billing?: {
    currency?: string;
    prices?: Record<
      string,
      {
        inputPerMillion: number;
        outputPerMillion: number;
        cachedInputPerMillion?: number;
      }
    >;
  };
  edition?: { features: string[] };
  fleet?: { available: boolean };
}
export interface SettingsProps {
  client: Client;
  config: WorkspaceConfig;
  reload: () => Promise<void>;
}
export function useResource<T>(client: Client, path: string) {
  const [data, setData] = useState<T>();
  const action = useAction();
  const load = async () => {
    const value = await client.request<T>(path);
    setData(value);
  };
  useEffect(() => {
    let alive = true;
    void action.run(async () => {
      const value = await client.request<T>(path);
      if (alive) setData(value);
    });
    return () => {
      alive = false;
    };
  }, [client, path]);
  return { data, load, action };
}
export function Toggle({
  title,
  value,
  disabled,
  onChange,
}: {
  title: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Row style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
      <Label style={{ flex: 1 }}>{title}</Label>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </Row>
  );
}
export type Field = {
  key: string;
  label: string;
  secret?: boolean;
  number?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
  multiline?: boolean;
  required?: boolean;
  options?: { id: string; label: string }[];
};
export function Form({
  title,
  description,
  fields,
  initial,
  submit = "Save",
  onSave,
}: {
  title: string;
  description?: string;
  fields: Field[];
  initial: Record<string, string>;
  submit?: string;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const dirty = useRef(false);
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    if (!dirty.current) setValues(JSON.parse(initialKey));
  }, [initialKey]);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const edit = (key: string, value: string) => {
    dirty.current = true;
    setSaved(false);
    setValues((old) => ({ ...old, [key]: value }));
  };
  return (
    <Section title={title}>
      {description && (
        <Label muted size={13}>
          {description}
        </Label>
      )}
      {fields.map((f) =>
        f.options ? (
          <Choice
            key={f.key}
            label={f.label}
            value={values[f.key] ?? ""}
            options={f.options}
            disabled={action.busy}
            onChange={(value) => edit(f.key, value)}
          />
        ) : (
          <Input
            key={f.key}
            label={f.label}
            value={values[f.key] ?? ""}
            secureTextEntry={f.secret}
            autoCapitalize="none"
            autoCorrect={false}
            multiline={f.multiline}
            keyboardType={f.number ? "decimal-pad" : "default"}
            editable={!action.busy}
            onChangeText={(value) => edit(f.key, value)}
          />
        ),
      )}
      <ErrorNotice error={action.error} />
      <Button
        title={action.busy ? "Saving…" : submit}
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            for (const field of fields) {
              const value = values[field.key]?.trim() ?? "";
              if (field.required && !value)
                throw new Error(`Enter ${field.label.toLowerCase()}.`);
              if (
                field.number &&
                value &&
                (!Number.isFinite(Number(value)) ||
                  (field.integer && !Number.isInteger(Number(value))) ||
                  (field.min !== undefined && Number(value) < field.min) ||
                  (field.max !== undefined && Number(value) > field.max))
              )
                throw new Error(
                  `Enter a valid ${field.label.toLowerCase()}${field.min !== undefined && field.max !== undefined ? ` (${field.min}–${field.max})` : ""}.`,
                );
            }
            await onSave(values);
            dirty.current = false;
            setValues((old) => ({
              ...old,
              ...Object.fromEntries(
                fields.filter((f) => f.secret).map((f) => [f.key, ""]),
              ),
            }));
            setSaved(true);
          })
        }
      />
      {saved && (
        <Label accessibilityLiveRegion="polite" muted>
          Saved.
        </Label>
      )}
    </Section>
  );
}
export const options = (...values: string[]) =>
  values.map((value) => ({ id: value, label: value }));
export function Notice({ children }: React.PropsWithChildren) {
  return (
    <View style={{ paddingVertical: 8 }}>
      <Label muted>{children}</Label>
    </View>
  );
}
