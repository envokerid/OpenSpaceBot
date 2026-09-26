import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { ApprovedCommandsResponse } from "../../shared/approved-commands";
import type { Client } from "./core/client";
import type { Bot } from "./core/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { Button, ErrorNotice, Label, Row, Sheet, useAction, useTheme } from "./ui";

export function McpApprovalScope({ client, tool, botId, onApprove }: { client: Client; tool: string; botId?: string; onApprove: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ApprovedCommandsResponse>();
  const [bots, setBots] = useState<Bot[]>([]);
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<string[]>(botId ? [botId] : []);
  const [includeNewBots, setIncludeNewBots] = useState(false);
  const action = useAction();
  const c = useTheme();
  const load = () => action.run(async () => {
    const [approvals, fleet] = await Promise.all([client.request<ApprovedCommandsResponse>("/api/settings/approved-commands"), client.request<{ bots: Bot[] }>("/api/bots?messages=0")]);
    setData(approvals); setBots(fleet.bots);
  });
  const check = (label: string, checked: boolean, onPress: () => void, radio = false) => <Pressable accessibilityRole={radio ? "radio" : "checkbox"} accessibilityLabel={label} accessibilityState={{ checked, disabled: action.busy }} disabled={action.busy} onPress={onPress} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 }}>
    <View style={{ width: 22, height: 22, borderRadius: radio ? 11 : 4, borderWidth: 1, borderColor: checked ? c.accent : c.muted, backgroundColor: checked ? c.accent : "transparent", alignItems: "center", justifyContent: "center" }}>{checked && <Icon name="check" size={16} color="#FFFFFF" />}</View><Label style={{ flex: 1 }}>{label}</Label>
  </Pressable>;
  return <><Button title="Approve for bots…" onPress={() => { setOpen(true); void load(); }} />
    {open && <Sheet title="Approve for bots" onClose={() => { if (!action.busy) setOpen(false); }}><ScrollView contentContainerStyle={{ padding: 20, gap: 8 }}>
      <Label muted>Always approve this MCP tool for the bots you choose. This also allows the current request once.</Label>
      {check("Selected bots", !all, () => setAll(false), true)}
      {check("All current bots", all, () => setAll(true), true)}
      {all ? check("Also approve for all new bots", includeNewBots, () => setIncludeNewBots(!includeNewBots)) : data?.bots.map(bot => <Row key={bot.id} style={{ flexWrap: "nowrap" }}>
        <Avatar bot={bots.find(profile => profile.id === bot.id) ?? { name: bot.name, color: "green" }} client={client} size={32} />
        <View style={{ flex: 1 }}>{check(bot.name, selected.includes(bot.id), () => setSelected(ids => ids.includes(bot.id) ? ids.filter(id => id !== bot.id) : [...ids, bot.id]))}</View>
      </Row>)}
      <ErrorNotice error={action.error} />
      {!data && <Button title="Retry loading bots" disabled={action.busy} onPress={() => void load()} />}
      <Button title="Save and approve" primary disabled={action.busy || !data || (!all && !selected.length)} onPress={() => void action.run(async () => {
        await client.request("/api/settings/approved-commands", "PATCH", { tool, approved: true, ...(all ? { allBots: true, includeNewBots } : { botIds: selected }) });
        await onApprove(); setOpen(false);
      })} />
      <Button title="Cancel" disabled={action.busy} onPress={() => setOpen(false)} />
    </ScrollView></Sheet>}
  </>;
}
