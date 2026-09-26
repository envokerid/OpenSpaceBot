import React, { useEffect, useState } from "react";
import { BackHandler, View } from "react-native";
import type { IconName } from "../Icon";
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
import { ApprovedCommandsSettings } from "./ApprovedCommands";
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
  { id: "approvedCommands", title: "Approved commands", detail: "Approve MCP tool calls for individual bots" },
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
    detail: "Tokens, cache hits, costs and budgets",
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
const groups: { title: string; ids: SectionId[] }[] = [
  { title: "Workspace", ids: ["general", "connections", "engines", "media"] },
  { title: "Tools & resources", ids: ["computer", "approvedCommands", "usage", "experimental"] },
  {
    title: "Administration",
    ids: ["people", "remote", "backups", "organization", "fleet"],
  },
];
const sectionIcons: Record<SectionId, { icon: IconName; color: string }> = {
  approvedCommands: { icon: "checkCircle", color: "#2BBD65" },
  general: { icon: "person", color: "#2BBD65" },
  connections: { icon: "hub", color: "#05AADB" },
  engines: { icon: "settings", color: "#7563EC" },
  media: { icon: "mic", color: "#AB59EA" },
  computer: { icon: "computer", color: "#7563EC" },
  usage: { icon: "list", color: "#E99730" },
  experimental: { icon: "checkCircle", color: "#CD609A" },
  people: { icon: "person", color: "#2BBD65" },
  remote: { icon: "phone", color: "#05AADB" },
  backups: { icon: "folder", color: "#E99730" },
  organization: { icon: "hub", color: "#647D90" },
  fleet: { icon: "computer", color: "#7563EC" },
};
export function WorkspaceSettings({
  session,
  onBack,
  initialSection,
}: {
  session: Session;
  onBack: () => void;
  initialSection?: SectionId;
}) {
  const client = session.client;
  const action = useAction();
  const [config, setConfig] = useState<WorkspaceConfig>();
  const [access, setAccess] = useState<{
    allowed: boolean;
    desktop: boolean;
  }>();
  const [section, setSection] = useState<SectionId | undefined>(initialSection);
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
      if (section && section !== initialSection) {
        setSection(undefined);
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [section, initialSection, onBack]);
  const props = config ? { client, config, reload: load } : undefined;
  return (
    <View style={{ flex: 1 }}>
      <Header
        title={
          sections.find((s) => s.id === section)?.title ?? "Workspace settings"
        }
        onBack={() => (section && section !== initialSection ? setSection(undefined) : onBack())}
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
            {groups.map((group) => {
              const visible = sections.filter(
                (s) =>
                  group.ids.includes(s.id) &&
                  (access.desktop || s.id !== "organization") &&
                  (s.id !== "fleet" ||
                    (config.fleet?.available &&
                      config.edition?.features.includes("admin"))) &&
                  `${s.title} ${s.detail}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              );
              if (!visible.length) return null;
              return (
                <Section key={group.title} title={group.title}>
                  {visible.map((s) => (
                    <SettingRow
                      key={s.id}
                      title={s.title}
                      subtitle={s.detail}
                      icon={sectionIcons[s.id].icon}
                      iconColor={sectionIcons[s.id].color}
                      onPress={() => setSection(s.id)}
                    />
                  ))}
                </Section>
              );
            })}
            {query.trim() &&
              !sections.some(
                (s) =>
                  (access.desktop || s.id !== "organization") &&
                  (s.id !== "fleet" ||
                    (config.fleet?.available &&
                      config.edition?.features.includes("admin"))) &&
                  `${s.title} ${s.detail}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              ) && <Label muted>No settings found.</Label>}
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
            {section === "approvedCommands" && <ApprovedCommandsSettings {...props} session={session} />}
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
