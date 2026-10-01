import React from "react";
import { Alert } from "react-native";
import { Button, ErrorNotice, Label, Row, Section } from "../ui";
import { useResource, type SettingsProps } from "./shared";

import { VmLibraryPanel } from "./VmLibrary";

interface ComputerStatus {
  runtime?: string;
  daemonUp?: boolean;
  image?: boolean;
  container?: string;
  ready?: boolean;
  problem?: string;
  commands?: Record<string, string | null>;
  network?: string;
  security?: string;
  persistence?: string;
}
interface Computer {
  botId?: string;
  boxId?: string;
  name: string;
  ownerName?: string;
  state?: string;
  container?: string;
  inUse?: boolean;
  problem?: string;
}
function Inventory({
  client,
  kind,
}: {
  client: SettingsProps["client"];
  kind: "local" | "boxes" | "vps";
}) {
  const path =
    kind === "local"
      ? "/api/local-computer/instances"
      : `/api/computers/${kind}`;
  const { data, load, action } = useResource<{
    instances: Computer[];
    problem?: string;
    available?: boolean;
  }>(client, path);
  return (
    <Section
      title={
        kind === "local"
          ? "Per-bot virtual machines"
          : kind === "boxes"
            ? "Cloud computers"
            : "VPS computers"
      }
    >
      <ErrorNotice error={action.error} />
      {data?.problem && <Label muted>{data.problem}</Label>}
      <Button
        title={`Refresh ${kind} computers`}
        disabled={action.busy}
        onPress={() => void action.run(load)}
      />
      {data?.instances.map((item) => (
        <Section
          key={item.boxId ?? item.botId ?? item.name}
          title={item.ownerName ?? item.name}
        >
          <Label muted>
            {item.state ?? item.container}
            {item.inUse ? " · In use" : ""}
          </Label>
          {item.problem && <Label muted>{item.problem}</Label>}
          <Row>
            {kind === "boxes" && (
              <Button
                title="Sleep"
                disabled={action.busy || item.inUse}
                onPress={() =>
                  void action.run(async () => {
                    await client.request(
                      `/api/computers/boxes/${encodeURIComponent(item.boxId!)}/sleep`,
                      "POST",
                      {},
                    );
                    await load();
                  })
                }
              />
            )}
            <Button
              title="Remove computer"
              danger
              disabled={action.busy || item.inUse}
              onPress={() =>
                Alert.alert(
                  `Remove ${item.ownerName ?? item.name}?`,
                  "This deletes this computer and its local files. Conversation history is kept.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () =>
                        void action.run(async () => {
                          const route =
                            kind === "local"
                              ? `/api/bots/${encodeURIComponent(item.botId!)}/local-computer/remove`
                              : `/api/computers/${kind}/${encodeURIComponent(kind === "boxes" ? item.boxId! : item.name)}/${kind === "boxes" ? "delete" : "remove"}`;
                          await client.request(
                            route,
                            "POST",
                            kind === "local" ? {} : { confirmName: item.name },
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
    </Section>
  );
}
export function ComputerSettings({ client }: SettingsProps) {
  const { data, load, action } = useResource<ComputerStatus>(
    client,
    "/api/local-computer",
  );
  const run = (operation: string) =>
    action.run(async () => {
      await client.request(
        `/api/local-computer/${operation}`,
        "POST",
        {},
        600000,
      );
      await load();
    });
  return (
    <>
      <ErrorNotice error={action.error} />
      <Section title="Local virtual machine">
        <Label muted>
          {data?.ready
            ? "Ready"
            : (data?.problem ?? data?.container ?? "Checking computer…")}
        </Label>
        <Label muted>Runtime: {data?.runtime ?? "Not installed"}</Label>
        <Button
          title="Refresh computer status"
          disabled={action.busy}
          onPress={() => void action.run(load)}
        />
        {data?.commands?.install && !data.runtime && (
          <>
            <Label muted>
              Run this on the connected computer to install its runtime:
            </Label>
            <Label selectable>{data.commands.install}</Label>
          </>
        )}
        {data?.commands?.runtimeStart && !data.daemonUp && (
          <Label selectable>{data.commands.runtimeStart}</Label>
        )}
        <Row>
          {data?.daemonUp && (
            <Button
              title="Prepare VM image"
              disabled={action.busy}
              onPress={() => void run("pull")}
            />
          )}
        </Row>
        <Label muted>
          Network: {data?.network ?? "Unknown"} · Security:{" "}
          {data?.security ?? "Unknown"} · Storage:{" "}
          {data?.persistence ?? "Unknown"}
        </Label>
      </Section>
      <VmLibraryPanel client={client} />
      <Inventory client={client} kind="boxes" />
      <Inventory client={client} kind="vps" />
    </>
  );
}
