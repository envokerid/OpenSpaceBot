import React from "react";
import { Alert } from "react-native";
import { randomUUID } from "expo-crypto";
import { localeChoices } from "../../../src/locales";
import {
  Button,
  ErrorNotice,
  Input,
  Label,
  Row,
  Section,
  useAction,
} from "../ui";
import { Form, Toggle, type SettingsProps } from "./shared";
import { useState } from "react";

export function GeneralSettings({ client, config, reload }: SettingsProps) {
  return (
    <>
      <Form
        title="Your profile"
        description="Shared with the connected workspace."
        fields={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
        ]}
        initial={{
          name: config.profile?.name ?? "",
          email: config.profile?.email ?? "",
        }}
        onSave={async (profile) => {
          await client.request("/api/config", "PATCH", { profile });
          await reload();
        }}
      />
      <Form
        title="Workspace language"
        fields={[
          {
            key: "language",
            label: "Language",
            options: [
              { id: "", label: "System language" },
              ...localeChoices.map((v) => ({ id: v.code, label: v.label })),
            ],
          },
        ]}
        initial={{ language: config.language ?? "" }}
        onSave={async (values) => {
          await client.request("/api/config", "PATCH", values);
          await reload();
        }}
      />
      <Form
        title="Group turns"
        fields={[
          {
            key: "minutes",
            label: "Maximum turn duration (minutes)",
            number: true,
            integer: true,
            min: 1,
            max: 1440,
            required: true,
          },
        ]}
        initial={{ minutes: String(config.rooms?.turnTimeoutMinutes ?? 5) }}
        onSave={async (v) => {
          await client.request("/api/config", "PATCH", {
            rooms: { turnTimeoutMinutes: Number(v.minutes) },
          });
          await reload();
        }}
      />
      <Form
        title="Parallel threads"
        description="Maximum simultaneous conversations for each bot."
        fields={[
          {
            key: "limit",
            label: "Concurrent threads per bot",
            options: Array.from({ length: 10 }, (_, i) => ({
              id: String(i + 1),
              label: String(i + 1),
            })),
          },
        ]}
        initial={{ limit: String(config.threads?.maxConcurrentPerBot ?? 3) }}
        onSave={async (v) => {
          await client.request("/api/config", "PATCH", {
            threads: { maxConcurrentPerBot: Number(v.limit) },
          });
          await reload();
        }}
      />
    </>
  );
}
export function ExperimentalSettings({
  client,
  config,
  reload,
}: SettingsProps) {
  const action = useAction();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string>();
  const profiles = config.browserProfiles ?? [];
  const saveProfiles = async (next: typeof profiles) => {
    await client.request("/api/config", "PATCH", {
      browserProfiles: next.map(({ id, name }) => ({ id, name })),
      expectedBrowserProfiles: profiles.map(({ id, name }) => ({ id, name })),
    });
    await reload();
  };
  return (
    <>
      <ErrorNotice error={action.error} />
      <Section title="Features">
        {[
          ["skillAuthoring", "Bot skill authoring"],
          ["browser", "Built-in browser"],
          ["showToolCalls", "Show tool calls"],
          ["claudeUserMcp", "Claude user MCP servers"],
        ].map(([key, title]) => (
          <Toggle
            key={key}
            title={title}
            value={config.features?.[key] === true}
            disabled={action.busy}
            onChange={(value) =>
              void action.run(async () => {
                await client.request("/api/config", "PATCH", {
                  features: { [key]: value },
                });
                await reload();
              })
            }
          />
        ))}
        {config.browserEngine?.reason && (
          <Label muted>{config.browserEngine.reason}</Label>
        )}
      </Section>
      <Section title="Browser profiles">
        {profiles.map((profile) => (
          <Row key={profile.id}>
            <Label style={{ flex: 1 }}>{profile.name}</Label>
            <Button
              title={`Rename ${profile.name}`}
              text
              disabled={action.busy}
              onPress={() => {
                setRenaming(profile.id);
                setName(profile.name);
              }}
            />
            <Button
              title={`Delete ${profile.name}`}
              text
              danger
              disabled={action.busy}
              onPress={() =>
                Alert.alert(
                  `Delete ${profile.name}?`,
                  "Its saved browser sessions will be removed.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () =>
                        void action.run(() =>
                          saveProfiles(
                            profiles.filter((p) => p.id !== profile.id),
                          ),
                        ),
                    },
                  ],
                )
              }
            />
          </Row>
        ))}
        <Input
          label={renaming ? "New profile name" : "Profile name"}
          value={name}
          onChangeText={setName}
        />
        <Button
          title={renaming ? "Save profile name" : "Add browser profile"}
          disabled={action.busy || !name.trim()}
          onPress={() =>
            void action.run(async () => {
              await saveProfiles(
                renaming
                  ? profiles.map((p) =>
                      p.id === renaming ? { ...p, name: name.trim() } : p,
                    )
                  : [...profiles, { id: randomUUID(), name: name.trim() }],
              );
              setName("");
              setRenaming(undefined);
            })
          }
        />
        {renaming && (
          <Button
            title="Cancel rename"
            text
            onPress={() => {
              setRenaming(undefined);
              setName("");
            }}
          />
        )}
      </Section>
    </>
  );
}
