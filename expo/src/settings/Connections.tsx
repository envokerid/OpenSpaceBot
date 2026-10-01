import React, { useState } from "react";
import { Button, Choice, ErrorNotice, Label, Section, useAction } from "../ui";
import { VoicePreview } from "../VoicePreview";
import { Form, options, useResource, type SettingsProps } from "./shared";

export function ConnectionSettings({ client, config, reload }: SettingsProps) {
  const action = useAction();
  const [result, setResult] = useState("");
  const providers = [
    {
      id: "anthropic",
      label: "Anthropic",
      field: "key",
      configured: config.anthropic?.configured,
      test: true,
    },
    {
      id: "openaiCompat",
      label: "OpenAI-compatible provider",
      field: "key",
      configured: config.openaiCompat?.configured,
      test: true,
    },
    {
      id: "xai",
      label: "xAI",
      field: "key",
      configured: config.xai?.configured,
      test: true,
    },
    {
      id: "box",
      label: "Box cloud computers",
      field: "token",
      configured: config.box?.configured,
    },
    {
      id: "opencodeGo",
      label: "OpenCode Go",
      field: "apiKey",
      configured: config.opencodeGo?.configured,
    },
  ];
  return (
    <>
      <Label muted>
        Keys are saved on the connected computer. Existing keys are never sent
        back to this phone. Leave a field empty to remove its saved key.
      </Label>
      {providers.map((provider) => (
        <React.Fragment key={provider.id}>
          <Form
            title={provider.label}
            description={
              provider.configured
                ? "A key is configured."
                : "No key configured."
            }
            fields={[
              { key: "key", label: `${provider.label} API key`, secret: true },
            ]}
            initial={{ key: "" }}
            onSave={async (v) => {
              await client.request("/api/config", "PATCH", {
                [provider.id]: { [provider.field]: v.key.trim() },
              });
              await reload();
            }}
          />
          {provider.test && (
            <Button
              title={`Test ${provider.label}`}
              disabled={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const answer = await client.request<{
                    ok?: boolean;
                    error?: string;
                    message?: string;
                  }>("/api/keys/test", "POST", { provider: provider.id });
                  setResult(
                    answer.ok
                      ? `${provider.label}: connection works.`
                      : (answer.error ??
                          answer.message ??
                          "The key test failed."),
                  );
                })
              }
            />
          )}
        </React.Fragment>
      ))}
      <ErrorNotice error={action.error} />
      {!!result && <Label accessibilityLiveRegion="polite">{result}</Label>}
      <Form
        title="OpenAI-compatible endpoint"
        fields={[{ key: "url", label: "Base URL" }]}
        initial={{ url: config.openaiCompat?.url ?? "" }}
        onSave={async (openaiCompat) => {
          await client.request("/api/config", "PATCH", { openaiCompat });
          await reload();
        }}
      />
      <Form
        title="VPS computer"
        description="Use an SSH configuration alias already set up on the connected computer."
        fields={[{ key: "sshAlias", label: "SSH alias" }]}
        initial={{ sshAlias: config.vps?.sshAlias ?? "" }}
        onSave={async (vps) => {
          await client.request("/api/config", "PATCH", { vps });
          await reload();
        }}
      />
    </>
  );
}
export function MediaSettings({ client, config, reload }: SettingsProps) {
  const catalog = useResource<{ voices: { id: string; label: string }[] }>(
    client,
    `/api/tts/voices?provider=${config.tts?.provider ?? "elevenlabs"}`,
  );
  return (
    <>
      <Form
        title="Voice provider"
        fields={[
          {
            key: "provider",
            label: "Provider",
            options: options(
              "elevenlabs",
              "fish",
              "system",
              "chatterbox",
              "xai",
            ),
          },
          { key: "voice", label: "Default voice ID" },
        ]}
        initial={{
          provider: config.tts?.provider ?? "elevenlabs",
          voice: config.tts?.voice ?? "",
        }}
        onSave={async (tts) => {
          await client.request("/api/config", "PATCH", {
            tts: {
              ...tts,
              ...(tts.provider !== config.tts?.provider &&
              tts.voice === (config.tts?.voice ?? "")
                ? { voice: "" }
                : {}),
            },
          });
          await reload();
          await catalog.load();
        }}
      />
      {config.tts?.provider === "chatterbox" && (
        <Form
          title="Chatterbox server"
          fields={[
            { key: "baseUrl", label: "Chatterbox server URL" },
            { key: "model", label: "Chatterbox model" },
          ]}
          initial={{
            baseUrl: config.tts.baseUrl ?? "",
            model: config.tts.model ?? "",
          }}
          onSave={async (tts) => {
            await client.request("/api/config", "PATCH", { tts });
            await reload();
            await catalog.load();
          }}
        />
      )}
      <Section title="Available voices">
        <ErrorNotice error={catalog.action.error} />
        <Button
          title="Refresh voices"
          disabled={catalog.action.busy}
          onPress={() => void catalog.action.run(catalog.load)}
        />
        <Choice
          label="Default voice"
          value={config.tts?.voice ?? ""}
          options={[
            { id: "", label: "Provider default" },
            ...(catalog.data?.voices ?? []),
          ]}
          disabled={catalog.action.busy}
          onChange={(voice) =>
            void catalog.action.run(async () => {
              await client.request("/api/config", "PATCH", { tts: { voice } });
              await reload();
            })
          }
        />
        <VoicePreview
          client={client}
          name={config.profile?.name || "OpenMausBot"}
          voice={config.tts?.voice ?? ""}
        />
      </Section>
      {[
        { key: "key", title: "ElevenLabs key" },
        { key: "fishKey", title: "Fish Audio key" },
      ].map((provider) => (
        <Form
          key={provider.key}
          title={provider.title}
          description="Save an empty field to remove this provider's key."
          fields={[{ key: "secret", label: provider.title, secret: true }]}
          initial={{ secret: "" }}
          onSave={async (values) => {
            await client.request("/api/config", "PATCH", {
              tts: { [provider.key]: values.secret.trim() },
            });
            await reload();
            await catalog.load();
          }}
        />
      ))}
      <Form
        title="Avatar images"
        fields={[
          {
            key: "provider",
            label: "Image provider",
            options: options("openai", "xai", "custom"),
          },
          { key: "customUrl", label: "Custom endpoint URL" },
          { key: "customModel", label: "Custom model" },
        ]}
        initial={{
          provider: config.imageGen?.provider ?? "openai",
          customUrl: config.imageGen?.customUrl ?? "",
          customModel: config.imageGen?.customModel ?? "",
        }}
        onSave={async (imageGen) => {
          await client.request("/api/config", "PATCH", { imageGen });
          await reload();
        }}
      />
      <Form
        title="Image API key"
        description={
          config.imageGen?.configured
            ? "Image generation is configured."
            : "Add the key for the selected provider."
        }
        fields={[{ key: "key", label: "Image API key", secret: true }]}
        initial={{ key: "" }}
        onSave={async (values) => {
          await client.request(
            "/api/config",
            "PATCH",
            config.imageGen?.provider === "xai"
              ? { xai: { key: values.key.trim() } }
              : {
                  imageGen: {
                    [config.imageGen?.provider === "custom"
                      ? "customApiKey"
                      : "key"]: values.key.trim(),
                  },
                },
          );
          await reload();
        }}
      />
    </>
  );
}
