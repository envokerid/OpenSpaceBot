import React, { useEffect, useState } from "react";
import { Alert, Image, Linking } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  PROVIDER_ICON_PRESETS,
  PROVIDER_ICON_LABELS,
  providerIconError,
  type ProviderIcon,
} from "../../../shared/provider-icon";
import type {
  EngineInstall,
  ProviderSnapshot,
} from "../../../server/contracts";
import type { Instance } from "../core/types";
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
import { Form, Toggle, useResource, type SettingsProps } from "./shared";

type Engine = Instance & {
  cli?: string;
  cliDefault?: string;
  cliCandidates?: string[];
  icon?: ProviderIcon;
  readOnly?: boolean;
  fastMode?: boolean;
  claudeAccount?: { configDir: string; isDefault: boolean };
  snapshot?: ProviderSnapshot;
  install?: EngineInstall;
  authentication?: {
    method: "device-code" | "paste-code" | "browser";
    signOut?: boolean;
  };
};
type Auth = {
  flowId?: string;
  authorizationUrl?: string;
  userCode?: string;
  phase?: string;
  message?: string;
};
const enginePath = (id: string) => {
  if (!/^[\w.-]+$/.test(id)) throw new Error("Invalid engine.");
  return `/api/instances/${encodeURIComponent(id)}`;
};
function EngineCard({
  engine,
  client,
  refresh,
}: {
  engine: Engine;
  client: SettingsProps["client"];
  refresh: () => Promise<void>;
}) {
  const action = useAction();
  const [expanded, setExpanded] = useState(false);
  const [flow, setFlow] = useState<Auth>();
  const [code, setCode] = useState("");
  const [failedCli, setFailedCli] = useState<string>();
  const path = enginePath(engine.instanceId);
  const managed = engine.readOnly || engine.instanceId.startsWith("company.");
  useEffect(() => {
    if (
      !flow?.flowId ||
      flow.phase === "succeeded" ||
      flow.phase === "failed" ||
      flow.phase === "cancelled" ||
      flow.phase === "expired"
    )
      return;
    let alive = true;
    let pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void client
        .request<{ auth: Auth }>(
          `${path}/auth/status?flowId=${encodeURIComponent(flow.flowId!)}`,
        )
        .then(async (result) => {
          if (alive) {
            setFlow(result.auth);
            if (result.auth.phase === "succeeded") await refresh();
          }
        })
        .catch(() => {})
        .finally(() => {
          pending = false;
        });
    }, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [client, path, flow?.flowId, flow?.phase]);
  const run = (operation: string, body: unknown = {}) =>
    action.run(async () => {
      await client.request(`${path}/${operation}`, "POST", body, 180000);
      await refresh();
    });
  return (
    <Section title={engine.displayName}>
      <Label muted>
        {engine.snapshot?.state}
        {engine.snapshot?.version ? ` · ${engine.snapshot.version}` : ""}
      </Label>
      {engine.snapshot?.reason && <Label muted>{engine.snapshot.reason}</Label>}
      <Label size={13} muted>
        {engine.models.options.length} models available
      </Label>
      {engine.snapshot?.account && (
        <Label muted>
          {engine.snapshot.account.email ??
            engine.snapshot.account.organization ??
            engine.snapshot.account.method}
        </Label>
      )}
      {engine.snapshot?.warning && (
        <Label>{engine.snapshot.warning.message}</Label>
      )}
      {engine.snapshot?.update && (
        <Label selectable>
          {engine.snapshot.update.message} · {engine.snapshot.update.command}
        </Label>
      )}
      <ErrorNotice error={action.error} />
      {managed ? (
        <Label muted>This engine is managed by your organization.</Label>
      ) : (
        <>
          <Row>
            <Button
              title="Refresh models"
              disabled={action.busy}
              onPress={() => void run("refresh-models")}
            />
            {engine.authentication && (
              <Button
                title="Sign in"
                disabled={action.busy}
                onPress={() =>
                  void action.run(async () => {
                    const result = await client.request<{ auth: Auth }>(
                      `${path}/auth/start`,
                      "POST",
                      {},
                    );
                    setFlow(result.auth);
                    if (
                      result.auth.authorizationUrl &&
                      /^https?:\/\//i.test(result.auth.authorizationUrl)
                    )
                      await Linking.openURL(result.auth.authorizationUrl);
                    await refresh();
                  })
                }
              />
            )}
            {(engine.install?.managed != null ||
              engine.install?.server != null) && (
              <Button
                title="Install engine"
                disabled={action.busy}
                onPress={() => void run("install")}
              />
            )}
          </Row>
          {flow && (
            <>
              <Label selectable>
                {flow.message ?? flow.phase ?? "Waiting for sign-in"}
              </Label>
              {flow.userCode && (
                <Label selectable bold>
                  {flow.userCode}
                </Label>
              )}
              {flow.flowId && flow.phase !== "succeeded" && (
                <>
                  <Input
                    label="Sign-in code or callback URL"
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="none"
                  />
                  <Row>
                    <Button
                      title="Complete sign-in"
                      disabled={action.busy || !code.trim()}
                      onPress={() =>
                        void run("auth/complete", {
                          flowId: flow.flowId,
                          callbackUrl: code.trim(),
                        })
                      }
                    />
                    <Button
                      title="Cancel sign-in"
                      disabled={action.busy}
                      onPress={() =>
                        void action.run(async () => {
                          await client.request(`${path}/auth/cancel`, "POST", {
                            flowId: flow.flowId,
                          });
                          setFlow(undefined);
                        })
                      }
                    />
                  </Row>
                </>
              )}
            </>
          )}
          {engine.snapshot?.authenticated && engine.authentication?.signOut && (
            <Button
              title="Sign out"
              danger
              disabled={action.busy}
              onPress={() =>
                Alert.alert(
                  `Sign out of ${engine.displayName}?`,
                  "Bots using this account will need you to sign in again.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Sign out",
                      style: "destructive",
                      onPress: () => void run("auth/sign-out"),
                    },
                  ],
                )
              }
            />
          )}
          {engine.driverKind === "codex" && (
            <>
              <Toggle
                title="Codex Fast mode"
                value={engine.fastMode !== false}
                disabled={action.busy}
                onChange={(fastMode) => void action.run(async () => {
                  await client.request(path, "PATCH", { fastMode });
                  await refresh();
                })}
              />
              <Label muted>Where supported, Fast uses more credits. Turn off for Standard speed. Applies to new personal Codex turns.</Label>
            </>
          )}
          <Button
            title={expanded ? "Hide advanced settings" : "Advanced settings"}
            text
            onPress={() => setExpanded(!expanded)}
          />
          {expanded && (
            <>
              <Form
                title="Command-line program"
                description="Path on the connected computer. Leave empty to use its detected default."
                fields={[{ key: "cli", label: "Program path" }]}
                initial={{ cli: engine.cli ?? "" }}
                onSave={async (v) => {
                  if (v.cli.trim()) {
                    const probe = await client.request<{
                      ok: boolean;
                      message?: string;
                    }>("/api/cli-test", "POST", {
                      cli: v.cli.trim(),
                      driver: engine.driverKind,
                    });
                    if (!probe.ok) {
                      setFailedCli(v.cli.trim());
                      throw new Error(
                        probe.message ?? "This program could not be started.",
                      );
                    }
                  }
                  await client.request(path, "PATCH", { cli: v.cli.trim() });
                  setFailedCli(undefined);
                  await refresh();
                }}
              />
              {failedCli && (
                <Section title="Program test failed">
                  <Label selectable>{failedCli}</Label>
                  <Button
                    title="Save this program anyway"
                    danger
                    disabled={action.busy}
                    onPress={() =>
                      Alert.alert(
                        "Save without a successful program test?",
                        `Bots using this engine may fail to start. Program: ${failedCli}`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Save anyway",
                            onPress: () =>
                              void action.run(async () => {
                                await client.request(path, "PATCH", {
                                  cli: failedCli,
                                });
                                setFailedCli(undefined);
                                await refresh();
                              }),
                          },
                        ],
                      )
                    }
                  />
                </Section>
              )}
              {engine.install?.command &&
                Object.entries(engine.install.command).map(
                  ([platform, command]) => (
                    <Label key={platform} selectable muted>
                      {platform}: {command}
                    </Label>
                  ),
                )}
              {engine.install?.signInCommand && (
                <Label selectable muted>
                  Sign in on the computer: {engine.install.signInCommand}
                </Label>
              )}
              <IconSettings engine={engine} client={client} refresh={refresh} />
              {(engine.cliCandidates?.length ?? 0) > 0 && (
                <Choice
                  label="Detected programs"
                  value={engine.cli ?? ""}
                  options={[
                    { id: "", label: "Use detected default" },
                    ...engine.cliCandidates!.map((id) => ({ id, label: id })),
                  ]}
                  disabled={action.busy}
                  onChange={(cli) =>
                    void action.run(async () => {
                      await client.request(path, "PATCH", { cli });
                      await refresh();
                    })
                  }
                />
              )}
              {engine.driverKind === "claudeAgent" && (
                <>
                  <Form
                    title="Claude account"
                    fields={[
                      {
                        key: "displayName",
                        label: "Account name",
                        required: true,
                      },
                      { key: "configDir", label: "Configuration directory" },
                    ]}
                    initial={{
                      displayName: engine.displayName,
                      configDir: engine.claudeAccount?.configDir ?? "",
                    }}
                    onSave={async (v) => {
                      await client.request(path, "PATCH", v);
                      await refresh();
                    }}
                  />
                  <Button
                    title="Update Claude"
                    disabled={action.busy}
                    onPress={() => void run("claude-update")}
                  />
                  {engine.claudeAccount && !engine.claudeAccount.isDefault && (
                    <Button
                      title="Remove account"
                      danger
                      disabled={action.busy}
                      onPress={() =>
                        Alert.alert(
                          "Remove this account?",
                          "Existing conversations are kept. Accounts in use cannot be removed.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Remove",
                              style: "destructive",
                              onPress: () =>
                                void action.run(async () => {
                                  await client.request(path, "DELETE");
                                  await refresh();
                                }),
                            },
                          ],
                        )
                      }
                    />
                  )}
                </>
              )}
              {["openai-compat", "grok", "minimax"].includes(
                engine.driverKind ?? "",
              ) && (
                <Toggle
                  title="Enable tool calls"
                  value={engine.capabilities?.agentsMcp === true}
                  disabled={action.busy}
                  onChange={(tools) =>
                    void action.run(async () => {
                      await client.request(path, "PATCH", { tools });
                      await refresh();
                    })
                  }
                />
              )}
            </>
          )}
        </>
      )}
    </Section>
  );
}
export function EngineSettings({ client }: SettingsProps) {
  const { data, load, action } = useResource<{ instances: Engine[] }>(
    client,
    "/api/instances",
  );
  return (
    <>
      <ErrorNotice error={action.error} />
      <Button
        title="Refresh engines"
        disabled={action.busy}
        onPress={() => void action.run(load)}
      />
      {data?.instances.map((engine) => (
        <EngineCard
          key={engine.instanceId}
          engine={engine}
          client={client}
          refresh={load}
        />
      ))}
      {data?.instances.some((engine) => !engine.readOnly) && (
        <Form
          title="Add Claude account"
          fields={[
            { key: "displayName", label: "Account name", required: true },
            { key: "configDir", label: "Configuration directory (optional)" },
          ]}
          initial={{ displayName: "", configDir: "" }}
          submit="Add account"
          onSave={async (v) => {
            await client.request("/api/instances/claude-accounts", "POST", v);
            await load();
          }}
        />
      )}
    </>
  );
}

function IconSettings({
  engine,
  client,
  refresh,
}: {
  engine: Engine;
  client: SettingsProps["client"];
  refresh: () => Promise<void>;
}) {
  const action = useAction();
  const save = async (icon: ProviderIcon | null) => {
    await client.request(`${enginePath(engine.instanceId)}/icon`, "PATCH", {
      icon,
    });
    await refresh();
  };
  return (
    <Section title="Engine icon">
      <ErrorNotice error={action.error} />
      {engine.icon?.kind === "custom" && (
        <Image
          source={{ uri: engine.icon.dataUrl }}
          style={{ width: 48, height: 48 }}
        />
      )}
      <Choice
        label="Built-in icon"
        value={engine.icon?.kind === "preset" ? engine.icon.preset : ""}
        options={[
          { id: "", label: "Default" },
          ...PROVIDER_ICON_PRESETS.map((id) => ({
            id,
            label: PROVIDER_ICON_LABELS[id],
          })),
        ]}
        disabled={action.busy}
        onChange={(id) =>
          void action.run(() =>
            save(
              id
                ? {
                    kind: "preset",
                    preset: id as (typeof PROVIDER_ICON_PRESETS)[number],
                  }
                : null,
            ),
          )
        }
      />
      <Button
        title="Upload engine icon"
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            const result = await DocumentPicker.getDocumentAsync({
              type: ["image/png", "image/jpeg", "image/webp"],
              copyToCacheDirectory: true,
            });
            if (result.canceled) return;
            const file = result.assets[0];
            const info = await FileSystem.getInfoAsync(file.uri);
            if (!info.exists || info.isDirectory || info.size > 131072)
              throw new Error("Choose an icon no larger than 128 KB.");
            const icon: ProviderIcon = {
              kind: "custom",
              dataUrl: `data:${file.mimeType ?? "image/png"};base64,${await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 })}`,
            };
            const error = providerIconError(icon);
            if (error) throw new Error(error);
            await save(icon);
          })
        }
      />
    </Section>
  );
}
