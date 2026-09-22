import React, { useEffect, useState } from "react";
import { BackHandler, View } from "react-native";
import type { Session } from "../core/session";
import { canAdminister } from "../core/types";
import {
  Button,
  ErrorNotice,
  Header,
  Input,
  Label,
  Page,
  Section,
  SettingRow,
  useAction,
} from "../ui";
import { GeneralSettings, ExperimentalSettings } from "./General";
import { ConnectionSettings, MediaSettings } from "./Connections";
import { EngineSettings } from "./Engines";
import { ComputerSettings } from "./Computers";
import { UsageSettings } from "./Usage";
import { PeopleSettings, RemoteAccessSettings, FleetSettings } from "./Access";
import { BackupSettings } from "./Backups";
import {
  DesktopRemoteSettings,
  OrganizationSettings,
  DesktopUpdates,
} from "./Desktop";
import type { WorkspaceConfig } from "./shared";

const sections = [
  {
    id: "general",
    title: "General",
    detail: "Profile, language, group turns and parallel threads",
  },
  {
    id: "connections",
    title: "Connections",
    detail: "Provider keys, endpoints and VPS access",
  },
  {
    id: "engines",
    title: "Engines",
    detail: "Models, accounts, sign-in and command-line programs",
  },
  {
    id: "media",
    title: "Voice & images",
    detail: "Voice providers, default voice and avatar generation",
  },
  {
    id: "experimental",
    title: "Experimental",
    detail: "Browser, tool calls, skills and browser profiles",
  },
  {
    id: "computer",
    title: "Computers",
    detail: "Virtual machines, cloud computers and isolation",
  },
  {
    id: "usage",
    title: "Usage",
    detail: "History, exports, budgets and model prices",
  },
  {
    id: "people",
    title: "People",
    detail: "Administrators, members and signed-in devices",
  },
  {
    id: "remote",
    title: "Remote access",
    detail: "Pairing, device permissions and custom domains",
  },
  {
    id: "backups",
    title: "Backups",
    detail: "Export, preview and restore an encrypted workspace",
  },
  {
    id: "organization",
    title: "Organization",
    detail: "Company sign-in and cloud backups",
  },
  {
    id: "fleet",
    title: "Hosted workspaces",
    detail: "Create, suspend and manage server workspaces",
  },
] as const;
type SectionId = (typeof sections)[number]["id"];
export function WorkspaceSettings({
  session,
  onBack,
}: {
  session: Session;
  onBack: () => void;
}) {
  const client = session.client;
  const action = useAction();
  const [config, setConfig] = useState<WorkspaceConfig>();
  const [access, setAccess] = useState<{
    allowed: boolean;
    desktop: boolean;
  }>();
  const [section, setSection] = useState<SectionId>();
  const [query, setQuery] = useState("");
  const load = async () => {
    const grant = client.connection.server
      ? { allowed: canAdminister(client.connection), desktop: false }
      : await client.request<{ allowed: boolean; desktop: boolean }>(
          "/api/companion/settings-access",
        );
    setAccess(grant);
    if (grant.allowed)
      setConfig(await client.request<WorkspaceConfig>("/api/config"));
  };
  useEffect(() => {
    void action.run(load);
  }, [client]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (section) {
        setSection(undefined);
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [section, onBack]);
  const props = config ? { client, config, reload: load } : undefined;
  return (
    <View style={{ flex: 1 }}>
      <Header
        title={
          sections.find((s) => s.id === section)?.title ?? "Workspace settings"
        }
        onBack={() => (section ? setSection(undefined) : onBack())}
      />
      <Page key={section ?? "index"}>
        <ErrorNotice error={action.error} />
        {action.error && (
          <Button
            title="Retry workspace settings"
            disabled={action.busy}
            onPress={() => void action.run(load)}
          />
        )}
        {!access && <Label muted>Loading workspace settings…</Label>}
        {access && !access.allowed && (
          <Section title="Workspace settings access">
            <Label>
              Enable “Manage workspace settings” for this phone in the desktop
              app’s Settings → Remote access → Paired phones. Hosted workspaces
              require an administrator sign-in.
            </Label>
            <Button
              title="Check settings access"
              disabled={action.busy}
              onPress={() => void action.run(load)}
            />
          </Section>
        )}
        {access?.allowed && !config && (
          <Button
            title="Retry loading settings"
            disabled={action.busy}
            onPress={() => void action.run(load)}
          />
        )}
        {config && access?.allowed && !section && (
          <>
            <Label muted>
              {client.connection.name} · Changes here apply to this workspace.
            </Label>
            <Input
              label="Search workspace settings"
              value={query}
              onChangeText={setQuery}
            />
            {sections
              .filter(
                (s) =>
                  (access.desktop || s.id !== "organization") &&
                  (s.id !== "fleet" ||
                    (config.fleet?.available &&
                      config.edition?.features.includes("admin"))) &&
                  `${s.title} ${s.detail}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((s) => (
                <Section key={s.id} title="">
                  <SettingRow
                    title={s.title}
                    onPress={() => setSection(s.id)}
                  />
                  <Label size={13} muted>
                    {s.detail}
                  </Label>
                </Section>
              ))}
            <Button
              title="Refresh workspace settings"
              disabled={action.busy}
              onPress={() => void action.run(load)}
            />
          </>
        )}
        {props && access?.allowed && (
          <>
            {section === "general" && (
              <>
                <GeneralSettings {...props} />
                {access.desktop && <DesktopUpdates client={client} />}
              </>
            )}
            {section === "connections" && <ConnectionSettings {...props} />}
            {section === "engines" && <EngineSettings {...props} />}
            {section === "media" && <MediaSettings {...props} />}
            {section === "experimental" && <ExperimentalSettings {...props} />}
            {section === "computer" && <ComputerSettings {...props} />}
            {section === "usage" && <UsageSettings {...props} />}
            {section === "people" && <PeopleSettings {...props} />}
            {section === "remote" && (
              <>
                {access.desktop && <DesktopRemoteSettings client={client} />}
                <RemoteAccessSettings {...props} />
              </>
            )}
            {section === "backups" && <BackupSettings {...props} />}
            {section === "organization" && (
              <OrganizationSettings client={client} />
            )}
            {section === "fleet" && <FleetSettings {...props} />}
          </>
        )}
      </Page>
    </View>
  );
}
