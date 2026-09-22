import React, { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import type { Client } from "../core/client";
import type { WorkspaceBackupSummary } from "../../../shared/workspace-backup";
import {
  Button,
  ErrorNotice,
  Input,
  Label,
  Row,
  Section,
  useAction,
} from "../ui";
import { Form, Toggle } from "./shared";

export async function desktopRequest<T>(
  client: Client,
  channel: string,
  ...args: unknown[]
): Promise<T> {
  const response = await client.response(
    "/api/companion/desktop-settings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, args }),
    },
    125000,
  );
  const body = JSON.parse(
    new TextDecoder().decode(await response.arrayBuffer()),
  ) as { result: T };
  return body.result;
}
function useDesktop<T>(client: Client, channel: string) {
  const [data, setData] = useState<T>();
  const action = useAction();
  const load = async () => {
    setData(await desktopRequest<T>(client, channel));
  };
  useEffect(() => {
    let alive = true;
    void action.run(async () => {
      const value = await desktopRequest<T>(client, channel);
      if (alive) setData(value);
    });
    return () => {
      alive = false;
    };
  }, [client, channel]);
  return { data, load, action };
}
type Organization =
  import("../../../electron/managed-desktop.mjs").ManagedDesktopState;
export function OrganizationSettings({ client }: { client: Client }) {
  const { data, load, action } = useDesktop<Organization>(
    client,
    "organization:state",
  );
  const run = (channel: string, ...args: unknown[]) =>
    action.run(async () => {
      await desktopRequest(client, channel, ...args);
      await load();
    });
  return (
    <>
      <ErrorNotice error={action.error} />
      <Section title="Organization">
        <Label>
          {data?.organization?.name ?? data?.status ?? "Loading organization…"}
        </Label>
        {data?.email && <Label>{data.email}</Label>}
        {data?.message && <Label muted>{data.message}</Label>}
        <Button
          title="Refresh organization"
          disabled={action.busy}
          onPress={() => void run("organization:refresh")}
        />
      </Section>
      {data?.status === "signed-out" && (
        <Form
          title="Sign in to an organization"
          fields={[
            {
              key: "portalOrigin",
              label: "Organization portal URL",
              required: true,
            },
          ]}
          initial={{ portalOrigin: "https://admin.openmausbot.com" }}
          submit="Begin sign-in"
          onSave={async (v) => {
            await desktopRequest(client, "organization:begin", v);
            await load();
          }}
        />
      )}
      {data?.enrollment && (
        <Section title="Finish organization sign-in">
          <Label selectable bold>
            {data.enrollment.userCode}
          </Label>
          <Label muted>
            Expires {new Date(data.enrollment.expiresAt).toLocaleTimeString()}
          </Label>
          <Button
            title="Open sign-in page"
            onPress={() => {
              if (/^https?:\/\//i.test(data.enrollment!.verificationUri))
                void Linking.openURL(data.enrollment!.verificationUri);
            }}
          />
          <Button
            title="Check sign-in"
            disabled={action.busy}
            onPress={() => void action.run(load)}
          />
          <Button
            title="Cancel sign-in"
            disabled={action.busy}
            onPress={() => void run("organization:cancel")}
          />
        </Section>
      )}
      {data &&
        ["connected", "reauth-required", "unavailable"].includes(
          data.status,
        ) && (
          <Button
            title="Disconnect organization"
            danger
            disabled={action.busy}
            onPress={() =>
              Alert.alert(
                "Disconnect this organization?",
                "Organization accounts and cloud backup access will be removed from the connected desktop.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Disconnect",
                    style: "destructive",
                    onPress: () => void run("organization:disconnect"),
                  },
                ],
              )
            }
          />
        )}
      {data?.cloudBackups && data.status === "connected" && (
        <CompanyBackups client={client} />
      )}
    </>
  );
}
interface CloudBackup {
  id: string;
  createdAt?: number;
  completedAt?: number;
  bytes?: number;
  sizeBytes?: number;
  passwordRequired?: boolean;
  status?: string;
}
function CompanyBackups({ client }: { client: Client }) {
  const status = useDesktop<{
    busy: boolean;
    pendingRestore?: boolean;
    message?: string;
    schedule?: { enabled: boolean; nextBackupAt?: number };
  }>(client, "company-backups:state");
  const listing = useDesktop<{ backups: CloudBackup[] }>(
    client,
    "company-backups:list",
  );
  const action = useAction();
  const cancelAction = useAction();
  const [scheduleConfirmation, setScheduleConfirmation] = useState<string>();
  const [selected, setSelected] = useState<CloudBackup>();
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<{
    id: string;
    summary: WorkspaceBackupSummary;
  }>();
  const [confirmation, setConfirmation] = useState("");
  const refresh = async () => {
    await Promise.all([status.load(), listing.load()]);
  };
  const busy = action.busy || status.data?.busy || status.data?.pendingRestore;
  return (
    <Section title="Company cloud backups">
      <ErrorNotice
        error={
          action.error ??
          cancelAction.error ??
          status.action.error ??
          listing.action.error
        }
      />
      {status.data?.message && <Label muted>{status.data.message}</Label>}
      <Row>
        <Button
          title="Refresh cloud backups"
          disabled={action.busy}
          onPress={() => void action.run(refresh)}
        />
        <Button
          title="Back up now"
          disabled={busy || !status.data}
          onPress={() =>
            void action.run(async () => {
              await desktopRequest(client, "company-backups:create", {
                clientState: {},
              });
              await refresh();
            })
          }
        />
      </Row>
      <Toggle
        title="Automatic daily backup"
        value={status.data?.schedule?.enabled === true}
        disabled={
          action.busy ||
          !status.data ||
          (!status.data.schedule?.enabled && !!busy)
        }
        onChange={(enabled) => {
          if (enabled) setScheduleConfirmation("");
          else
            void action.run(async () => {
              await desktopRequest(
                client,
                "company-backups:configure-schedule",
                { enabled: false },
              );
              await refresh();
            });
        }}
      />
      {scheduleConfirmation !== undefined && (
        <>
          <Label>
            Daily backups upload this workspace to your organization. Type BACK
            UP THIS WORKSPACE DAILY to enable.
          </Label>
          <Input
            label="Daily backup confirmation"
            value={scheduleConfirmation}
            onChangeText={setScheduleConfirmation}
          />
          <Button
            title="Enable daily backups"
            disabled={
              busy || scheduleConfirmation !== "BACK UP THIS WORKSPACE DAILY"
            }
            onPress={() =>
              void action.run(async () => {
                await desktopRequest(
                  client,
                  "company-backups:configure-schedule",
                  { enabled: true, confirmation: scheduleConfirmation },
                );
                setScheduleConfirmation(undefined);
                await refresh();
              })
            }
          />
          <Button
            title="Cancel daily backup setup"
            text
            onPress={() => setScheduleConfirmation(undefined)}
          />
        </>
      )}
      {listing.data?.backups.map((entry) => (
        <Section
          key={entry.id}
          title={new Date(
            entry.completedAt ?? entry.createdAt ?? 0,
          ).toLocaleString()}
        >
          <Label muted>
            {entry.status ?? "Backup"} ·{" "}
            {((entry.bytes ?? entry.sizeBytes ?? 0) / 1048576).toFixed(1)} MB
          </Label>
          <Row>
            <Button
              title="Preview restore"
              disabled={busy}
              onPress={() => {
                setSelected(entry);
                setPassword("");
                setPreview(undefined);
                setConfirmation("");
              }}
            />
            <Button
              title="Delete cloud backup"
              danger
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Delete this cloud backup?",
                  "This permanently deletes the selected backup.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () =>
                        void action.run(async () => {
                          await desktopRequest(
                            client,
                            "company-backups:delete",
                            { id: entry.id, confirmation: "DELETE" },
                          );
                          await refresh();
                        }),
                    },
                  ],
                )
              }
            />
          </Row>
        </Section>
      ))}
      {selected && !preview && (
        <>
          {selected.passwordRequired !== false && (
            <Input
              label="Cloud backup password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          )}
          <Button
            title="Prepare cloud restore"
            disabled={
              busy || (selected.passwordRequired !== false && !password)
            }
            onPress={() =>
              void action.run(async () => {
                setPreview(
                  await desktopRequest(client, "company-backups:preview", {
                    id: selected.id,
                    ...(selected.passwordRequired !== false
                      ? { password }
                      : {}),
                  }),
                );
                setPassword("");
                await status.load();
              })
            }
          />
        </>
      )}
      {preview && (
        <>
          <Label>
            {preview.summary.bots} bots · {preview.summary.threads} threads ·{" "}
            {preview.summary.messages} messages
          </Label>
          {preview.summary.warnings.map((warning, i) => (
            <Label key={i}>{warning}</Label>
          ))}
          <Input
            label="Type REPLACE to restore"
            value={confirmation}
            onChangeText={setConfirmation}
          />
          <Button
            title="Replace workspace from cloud backup"
            danger
            disabled={busy || confirmation !== "REPLACE"}
            onPress={() =>
              void action.run(async () => {
                await desktopRequest(client, "company-backups:restore", {
                  id: preview.id,
                  confirmation,
                });
                setPreview(undefined);
                setSelected(undefined);
                await refresh();
              })
            }
          />
        </>
      )}
      {(action.busy || status.data?.busy || preview) && (
        <Button
          title="Cancel backup operation"
          disabled={cancelAction.busy}
          onPress={() =>
            void cancelAction.run(async () => {
              await desktopRequest(client, "company-backups:cancel");
              setPreview(undefined);
              setSelected(undefined);
              await status.load();
            })
          }
        />
      )}
    </Section>
  );
}
interface Companion {
  enabled: boolean;
  keepAwake: boolean;
  error?: string;
  addresses?: string[];
  tailnetName?: string;
  pairing?: { code: string; token: string; expiresAt: number };
  devices: {
    id: string;
    name: string;
    cloudDesktopAccess: boolean;
    settingsAccess?: boolean;
  }[];
}
export function DesktopRemoteSettings({ client }: { client: Client }) {
  const [stopping, setStopping] = useState(false);
  const { data, load, action } = useDesktop<Companion>(
    client,
    "companion:state",
  );
  const run = (channel: string, ...args: unknown[]) =>
    action.run(async () => {
      await desktopRequest(client, channel, ...args);
      await load();
    });
  return (
    <>
      <ErrorNotice error={action.error} />
      <Section title="Desktop remote access">
        {stopping && (
          <Label>
            Remote access is stopping. Re-enable it on the computer to
            reconnect.
          </Label>
        )}
        <Label muted>
          {data?.error ??
            (data?.enabled
              ? "Remote access is running."
              : "Remote access is stopped.")}
        </Label>
        <Button
          title="Refresh remote access"
          disabled={action.busy}
          onPress={() => void action.run(load)}
        />
        <Button
          title="Turn off desktop remote access"
          danger
          disabled={action.busy || !data?.enabled || stopping}
          onPress={() =>
            Alert.alert(
              "Turn off remote access?",
              "This disconnects every paired phone. You will need the desktop app to turn remote access back on.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Turn off",
                  style: "destructive",
                  onPress: () =>
                    void action.run(async () => {
                      await desktopRequest(client, "companion:stop");
                      setStopping(true);
                    }),
                },
              ],
            )
          }
        />
        <Toggle
          title="Keep computer awake"
          value={data?.keepAwake === true}
          disabled={action.busy}
          onChange={(enabled) => void run("companion:keep-awake", enabled)}
        />
        <Button
          title="Refresh Tailscale address"
          disabled={action.busy}
          onPress={() => void run("companion:refresh-tailscale")}
        />
        {data?.tailnetName && <Label selectable>{data.tailnetName}</Label>}
        {data?.addresses?.map((address) => (
          <Label key={address} selectable>
            {address}
          </Label>
        ))}
        <Button
          title={data?.pairing ? "Close phone pairing" : "Pair another phone"}
          disabled={action.busy}
          onPress={() =>
            void run("companion:pairing", !data?.pairing, data?.pairing?.token)
          }
        />
        {data?.pairing && (
          <>
            <Label size={24} bold selectable>
              {data.pairing.code}
            </Label>
            <Label muted>
              Expires {new Date(data.pairing.expiresAt).toLocaleTimeString()}
            </Label>
          </>
        )}
      </Section>
      <Section title="Paired phones">
        {data?.devices.map((device) => (
          <Section key={device.id} title={device.name}>
            <Toggle
              title={`Cloud desktop access for ${device.name}`}
              value={device.cloudDesktopAccess}
              disabled={action.busy}
              onChange={(enabled) =>
                void run("companion:cloud-desktop", device.id, enabled)
              }
            />
            <Toggle
              title={`Workspace settings for ${device.name}`}
              value={device.settingsAccess === true}
              disabled={action.busy}
              onChange={(enabled) =>
                void run("companion:settings-access", device.id, enabled)
              }
            />
            <Button
              title={`Revoke ${device.name}`}
              danger
              disabled={action.busy}
              onPress={() =>
                Alert.alert(
                  `Revoke ${device.name}?`,
                  "This phone will need to pair again.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Revoke",
                      style: "destructive",
                      onPress: () => void run("companion:revoke", device.id),
                    },
                  ],
                )
              }
            />
          </Section>
        ))}
      </Section>
      <CompanionAccount client={client} />
    </>
  );
}
function CompanionAccount({ client }: { client: Client }) {
  const { data, load, action } = useDesktop<{
    status?: string;
    available?: boolean;
    endpoint?: string;
    email?: string;
    message?: string;
  }>(client, "companion-account:state");
  if (data?.available === false)
    return (
      <Section title="Secure remote connection">
        <Label muted>
          {data.message ??
            "The remote connection service is unavailable in this desktop build."}
        </Label>
      </Section>
    );
  return (
    <Section title="Secure remote connection">
      <ErrorNotice error={action.error} />
      <Label muted>
        {data?.message ?? data?.status ?? "Checking account…"}
      </Label>
      {data?.email && <Label>{data.email}</Label>}
      {data?.endpoint && <Label selectable>{data.endpoint}</Label>}
      <Form
        title="Email sign-in"
        fields={[{ key: "email", label: "Email", required: true }]}
        initial={{ email: data?.email ?? "" }}
        submit="Request sign-in code"
        onSave={async (v) => {
          await desktopRequest(
            client,
            "companion-account:request-code",
            v.email,
          );
          await load();
        }}
      />
      <Form
        title="Confirm sign-in"
        fields={[
          { key: "email", label: "Email", required: true },
          { key: "code", label: "Email code", required: true },
        ]}
        initial={{ email: data?.email ?? "", code: "" }}
        submit="Verify code"
        onSave={async (v) => {
          await desktopRequest(
            client,
            "companion-account:verify-code",
            v.email,
            v.code,
          );
          await load();
        }}
      />
      <Button
        title="Retry secure connection"
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            await desktopRequest(client, "companion-account:retry");
            await load();
          })
        }
      />
      <Button
        title="Sign out of remote connection"
        danger
        disabled={action.busy}
        onPress={() =>
          Alert.alert(
            "Sign out of remote access?",
            "This may disconnect this phone. Local access remains available.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign out",
                style: "destructive",
                onPress: () =>
                  void action.run(async () => {
                    await desktopRequest(client, "companion-account:sign-out");
                    await load();
                  }),
              },
            ],
          )
        }
      />
    </Section>
  );
}

export function DesktopUpdates({ client }: { client: Client }) {
  const { data, load, action } = useDesktop<{
    status: string;
    supported: boolean;
    currentVersion: string;
    version?: string;
    message?: string;
    percent?: number;
    installMode?: string;
  }>(client, "update:get-state");
  const run = (channel: string) =>
    action.run(async () => {
      await desktopRequest(client, channel);
      await load();
    });
  useEffect(() => {
    if (
      !data ||
      !["checking", "downloading", "preparing"].includes(data.status)
    )
      return;
    const timer = setInterval(() => void action.run(load), 2500);
    return () => clearInterval(timer);
  }, [data?.status, client]);
  return (
    <Section title="Desktop app updates">
      <ErrorNotice error={action.error} />
      <Label>
        {data?.currentVersion
          ? `Installed: ${data.currentVersion}`
          : "Checking desktop version…"}
      </Label>
      <Label muted>
        {data?.message ?? data?.status}
        {data?.version ? ` · ${data.version}` : ""}
        {data?.percent != null ? ` · ${Math.round(data.percent)}%` : ""}
      </Label>
      {data?.supported === false ? (
        <Label muted>
          Automatic updates are available in packaged desktop builds. Update
          this Expo app through its distribution channel.
        </Label>
      ) : (
        <>
          <Button
            title="Check desktop updates"
            disabled={action.busy}
            onPress={() => void run("update:check")}
          />
          {data?.status === "available" && (
            <Button
              title="Download desktop update"
              disabled={action.busy}
              onPress={() => void run("update:download")}
            />
          )}
          {data?.status === "downloaded" && (
            <Button
              title="Install desktop update"
              disabled={action.busy}
              onPress={() =>
                Alert.alert(
                  "Update the desktop app?",
                  data.installMode === "handoff"
                    ? "The desktop will open its package installation instructions. Finish installation on the computer."
                    : "The desktop app will restart and disconnect this phone briefly.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Install",
                      onPress: () => void run("update:install"),
                    },
                  ],
                )
              }
            />
          )}
        </>
      )}
    </Section>
  );
}
