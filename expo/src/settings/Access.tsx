import React, { useState } from "react";
import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Choice, ErrorNotice, Label, Row, Section } from "../ui";
import { Form, options, useResource, type SettingsProps } from "./shared";

export function PeopleSettings({ client, config, reload }: SettingsProps) {
  const { data, load, action } = useResource<{
    sessions: {
      id: string;
      label: string;
      email?: string;
      scopes: string[];
      lastSeenAt?: number;
    }[];
  }>(client, "/api/auth/sessions");
  const lists = {
    admins: config.signIn?.admins ?? [],
    members: config.signIn?.members ?? [],
  };
  const save = async (next: typeof lists) => {
    await client.request("/api/config", "PATCH", { signIn: next });
    await reload();
    await load();
  };
  return (
    <>
      <ErrorNotice error={action.error} />
      <Form
        title="Add a person"
        description="Grant access to an email address or an @domain. This updates access; it does not send an email."
        fields={[
          { key: "email", label: "Email or @domain", required: true },
          { key: "role", label: "Role", options: options("member", "admin") },
        ]}
        initial={{ email: "", role: "member" }}
        submit="Add person"
        onSave={async (v) => {
          const email = v.email.trim().toLowerCase();
          if (!/^(?:[^\s@]+)?@[^\s@]+\.[^\s@]+$/.test(email))
            throw new Error("Enter a valid email address or @domain.");
          const next = {
            admins: lists.admins.filter((x) => x !== email),
            members: lists.members.filter((x) => x !== email),
          };
          next[v.role === "admin" ? "admins" : "members"].push(email);
          await save(next);
        }}
      />
      {(["admins", "members"] as const).map((role) => (
        <Section
          key={role}
          title={role === "admins" ? "Administrators" : "Members"}
        >
          {lists[role].length ? (
            lists[role].map((email) => (
              <Row key={email}>
                <Label style={{ flex: 1 }} selectable>
                  {email}
                </Label>
                <Button
                  title="Remove"
                  danger
                  disabled={action.busy}
                  onPress={() =>
                    Alert.alert(
                      `Remove ${email}?`,
                      "This person will lose the access granted by this entry.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () =>
                            void action.run(() =>
                              save({
                                ...lists,
                                [role]: lists[role].filter((x) => x !== email),
                              }),
                            ),
                        },
                      ],
                    )
                  }
                />
              </Row>
            ))
          ) : (
            <Label muted>No entries.</Label>
          )}
        </Section>
      ))}
      <Section title="Active sessions">
        <Button
          title="Refresh sessions"
          disabled={action.busy}
          onPress={() => void action.run(load)}
        />
        {data?.sessions.map((session) => (
          <Section key={session.id} title={session.label}>
            <Label muted>{session.email ?? session.scopes.join(", ")}</Label>
            <Button
              title={`Revoke ${session.label}`}
              danger
              disabled={action.busy}
              onPress={() =>
                Alert.alert(
                  "Revoke this session?",
                  "This device will have to sign in again.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Revoke",
                      style: "destructive",
                      onPress: () =>
                        void action.run(async () => {
                          await client.request(
                            `/api/auth/sessions/${encodeURIComponent(session.id)}`,
                            "DELETE",
                          );
                          await load();
                        }),
                    },
                  ],
                )
              }
            />
          </Section>
        ))}
      </Section>
    </>
  );
}
export function RemoteAccessSettings({ client }: SettingsProps) {
  const {
    data: domain,
    load,
    action,
  } = useResource<{
    customDomain?: string;
    publicUrl?: string;
    supported: boolean;
    serverIpv4?: string;
  }>(client, "/api/settings/custom-domain");
  const [scope, setScope] = useState("client");
  const [offer, setOffer] = useState<{
    id: string;
    code: string;
    expiresAt: number;
    inviteUrl?: string;
    url?: string;
    hint?: string;
  }>();
  return (
    <>
      <ErrorNotice error={action.error} />
      <Section title="Pair another device">
        <Label muted>
          Pairing codes grant access to the connected workspace. Administrator
          access includes all workspace settings.
        </Label>
        <Choice
          label="Access level"
          value={scope}
          options={[
            { id: "client", label: "Chat only" },
            { id: "admin", label: "Administrator" },
          ]}
          onChange={setScope}
        />
        <Button
          title="Create pairing code"
          disabled={action.busy}
          onPress={() =>
            void action.run(async () => {
              setOffer(
                await client.request("/api/auth/pairing", "POST", {
                  scopes: scope === "admin" ? ["admin", "client"] : ["client"],
                }),
              );
            })
          }
        />
        {offer && (
          <>
            <Label size={24} bold selectable>
              {offer.code}
            </Label>
            <Label muted>
              Expires {new Date(offer.expiresAt).toLocaleTimeString()}
            </Label>
            {offer.hint && <Label muted>{offer.hint}</Label>}
            <Row>
              <Button
                title="Copy pairing code"
                onPress={() => void Clipboard.setStringAsync(offer.code)}
              />
              {(offer.inviteUrl || offer.url) && (
                <Button
                  title="Copy pairing link"
                  onPress={() =>
                    void Clipboard.setStringAsync(offer.inviteUrl ?? offer.url!)
                  }
                />
              )}
              <Button
                title="Cancel pairing code"
                disabled={action.busy}
                onPress={() =>
                  void action.run(async () => {
                    await client.request(
                      `/api/auth/pairing/${encodeURIComponent(offer.id)}`,
                      "DELETE",
                    );
                    setOffer(undefined);
                  })
                }
              />
            </Row>
          </>
        )}
      </Section>
      <Section title="Workspace address">
        <Label selectable>
          {domain?.publicUrl ?? client.connection.endpoint.url}
        </Label>
        {domain?.serverIpv4 && (
          <Label selectable>Point DNS to {domain.serverIpv4}</Label>
        )}
        {domain?.supported === false && (
          <Label muted>
            Custom domains are configured on self-hosted servers. Use desktop
            remote access for this connection.
          </Label>
        )}
      </Section>
      {domain?.supported && (
        <>
          <Form
            title="Custom domain"
            description="For self-hosted servers. The server verifies DNS and HTTPS before updating pairing links."
            fields={[{ key: "domain", label: "Domain", required: true }]}
            initial={{ domain: domain?.customDomain ?? "" }}
            onSave={async (v) => {
              await client.request("/api/settings/custom-domain", "POST", v);
              await load();
            }}
          />
          <Button
            title="Disconnect custom domain"
            danger
            disabled={action.busy}
            onPress={() =>
              Alert.alert(
                "Disconnect the custom domain?",
                "Future pairing links will use the default workspace address.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Disconnect",
                    style: "destructive",
                    onPress: () =>
                      void action.run(async () => {
                        await client.request(
                          "/api/settings/custom-domain",
                          "DELETE",
                          {},
                        );
                        await load();
                      }),
                  },
                ],
              )
            }
          />
        </>
      )}
    </>
  );
}
export function FleetSettings({ client }: SettingsProps) {
  const { data, load, action } = useResource<{
    domain: string;
    workspaces: {
      slug: string;
      host: string;
      status: string;
      usage?: { costUsd?: number };
    }[];
  }>(client, "/api/fleet");
  const [selected, setSelected] = useState("");
  const operate = (slug: string, operation: string) =>
    action.run(async () => {
      await client.request(
        `/api/fleet/workspaces/${encodeURIComponent(slug)}/${operation}`,
        "POST",
        {},
      );
      await load();
    });
  return (
    <>
      <ErrorNotice error={action.error} />
      <Button
        title="Refresh workspaces"
        disabled={action.busy}
        onPress={() => void action.run(load)}
      />
      {data?.workspaces.map((w) => (
        <Section key={w.slug} title={w.slug}>
          <Label selectable>{w.host}</Label>
          <Label muted>
            {w.status}
            {w.usage?.costUsd != null
              ? ` · $${w.usage.costUsd.toFixed(2)}`
              : ""}
          </Label>
          <Row>
            <Button
              title={w.status === "suspended" ? "Resume" : "Suspend"}
              disabled={action.busy}
              onPress={() =>
                void operate(
                  w.slug,
                  w.status === "suspended" ? "resume" : "suspend",
                )
              }
            />
            <Button
              title="Manage people"
              disabled={action.busy}
              onPress={() => setSelected(w.slug)}
            />
            <Button
              title="Delete workspace"
              danger
              disabled={action.busy}
              onPress={() =>
                Alert.alert(
                  `Delete ${w.slug}?`,
                  "The workspace will stop. Choose whether its data is retained.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Keep data",
                      onPress: () =>
                        void action.run(async () => {
                          await client.request(
                            `/api/fleet/workspaces/${encodeURIComponent(w.slug)}`,
                            "DELETE",
                            { keepData: true },
                          );
                          await load();
                        }),
                    },
                    {
                      text: "Delete data too",
                      style: "destructive",
                      onPress: () =>
                        void action.run(async () => {
                          await client.request(
                            `/api/fleet/workspaces/${encodeURIComponent(w.slug)}`,
                            "DELETE",
                            { keepData: false },
                          );
                          await load();
                        }),
                    },
                  ],
                )
              }
            />
          </Row>
        </Section>
      ))}
      {!!selected && (
        <Form
          key={selected}
          title={`People in ${selected}`}
          fields={[
            { key: "email", label: "Email", required: true },
            {
              key: "action",
              label: "Action",
              options: options("add", "remove"),
            },
            {
              key: "role",
              label: "Access",
              options: options("member", "admin"),
            },
          ]}
          initial={{ email: "", action: "add", role: "member" }}
          onSave={async (v) => {
            await client.request(
              `/api/fleet/workspaces/${encodeURIComponent(selected)}/users`,
              "POST",
              {
                action: v.action,
                email: v.email.trim(),
                chatOnly: v.role === "member",
              },
            );
            await load();
          }}
        />
      )}
      <Form
        title="Create workspace"
        fields={[
          { key: "slug", label: "Workspace name", required: true },
          { key: "admin", label: "Administrator email", required: true },
          { key: "members", label: "Member emails (comma separated)" },
          { key: "cap", label: "Monthly limit (USD)", number: true, min: 0 },
          {
            key: "anthropicKey",
            label: "Anthropic key (optional)",
            secret: true,
          },
        ]}
        initial={{
          slug: "",
          admin: "",
          members: "",
          cap: "",
          anthropicKey: "",
        }}
        submit="Create workspace"
        onSave={async (v) => {
          await client.request("/api/fleet/workspaces", "POST", {
            slug: v.slug.trim().toLowerCase(),
            admins: [v.admin.trim()],
            members: v.members.split(/[,\s]+/).filter(Boolean),
            ...(v.cap ? { cap: Number(v.cap) } : {}),
            ...(v.anthropicKey ? { anthropicKey: v.anthropicKey } : {}),
          });
          await load();
        }}
      />
      <Button
        title="Upgrade all workspaces"
        disabled={action.busy}
        onPress={() =>
          Alert.alert(
            "Upgrade all workspaces?",
            "This may restart running workspaces.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Upgrade",
                onPress: () =>
                  void action.run(async () => {
                    await client.request("/api/fleet/upgrade", "POST", {});
                    await load();
                  }),
              },
            ],
          )
        }
      />
    </>
  );
}
