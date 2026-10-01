import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { mcpApprovalKey, mcpToolApproved, type ApprovedCommandsResponse } from "../../../shared/approved-commands";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import type { Session } from "../core/session";
import { Button, ErrorNotice, Input, Label, Section, Toggle, useAction, useTheme } from "../ui";
import type { SettingsProps } from "./shared";

export function ApprovedCommandsSettings({ client, session }: SettingsProps & { session: Session }) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const [data, setData] = useState<ApprovedCommandsResponse>();
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const c = useTheme();
  const action = useAction();
  const load = async () => setData(await client.request<ApprovedCommandsResponse>("/api/settings/approved-commands"));
  useEffect(() => { void action.run(load); }, [client]);
  const tools = [...new Set([...(data?.tools ?? []), ...added])].sort().filter(name => name.toLowerCase().includes(query.toLowerCase()));
  return <>
    <Section title="MCP tools">
      <Label muted>Approve MCP tools for each bot across all its conversations. Connector execution requires approval. Turning a switch off removes this standing approval; the bot’s normal permission mode still applies. Tools that request permission appear automatically, or you can add one by its exact MCP name.</Label>
      <ErrorNotice error={action.error} />
      <Button title="Refresh approved commands" disabled={action.busy} onPress={() => void action.run(load)} />
      {!data && !action.error && <Label muted>Loading approved commands…</Label>}
      <Input label="Search MCP tools" value={query} onChangeText={setQuery} />
      <Input label="MCP tool name" placeholder="mcp__server__tool" value={tool} onChangeText={setTool} autoCapitalize="none" />
      <Button title="Add tool" disabled={!tool.trim() || action.busy} onPress={() => void action.run(async () => {
        const key = mcpApprovalKey(tool.trim());
        if (!key) throw new Error("Use mcp__server__tool, or connectors_execute_tool.");
        setAdded(previous => [...new Set([...previous, key])]); setTool(""); setQuery("");
      })} />
    </Section>
    {data && !data.bots.length && <Label muted>Create a bot to manage its approvals.</Label>}
    {data && !tools.length && <Label muted>No matching MCP tools.</Label>}
    {data && !!tools.length && <Section title="Approved tools">{tools.map(name => <View key={name} style={{ borderBottomWidth: 1, borderBottomColor: c.line, overflow: "hidden" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ expanded: expanded.has(name) }} onPress={() => setExpanded(previous => {
          const next = new Set(previous);
          if (next.has(name)) next.delete(name); else next.add(name);
          return next;
        })} style={{ minHeight: 62, paddingHorizontal: 2, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Label size={14} style={{ flex: 1 }}>{name}</Label>
          <View style={{ transform: [{ rotate: expanded.has(name) ? "180deg" : "0deg" }] }}><Icon name="dropdown" color={c.text} /></View>
        </Pressable>
        {expanded.has(name) && <View style={{ backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <Label muted size={13} style={{ flex: 1 }}>Also approve for all new bots</Label>
            <Toggle label={`Approve ${name} for new bots`} value={mcpToolApproved(data.newBotApprovals, name)} disabled={action.busy} onChange={includeNewBots => void action.run(async () => {
              setData(await client.request<ApprovedCommandsResponse>("/api/settings/approved-commands", "PATCH", { tool: name, botIds: [], approved: true, includeNewBots }));
            })} />
          </View>
          {data.bots.map((bot, index) => <View key={bot.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: c.line }}>
          <Avatar bot={state.bots.find(profile => profile.id === bot.id) ?? { name: bot.name, color: "green" }} client={client} size={32} />
          <Label size={14} style={{ flex: 1 }}>{bot.name}</Label>
          <Toggle label={`${bot.name}: ${name}`} value={mcpToolApproved(bot.approvals, name)} disabled={action.busy} onChange={approved => void action.run(async () => {
          setData(await client.request<ApprovedCommandsResponse>("/api/settings/approved-commands", "PATCH", { botId: bot.id, tool: name, approved }));
        })} /></View>)}</View>}
      </View>)}</Section>}
  </>;
}
