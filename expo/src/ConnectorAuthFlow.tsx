import React, { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import * as WebBrowser from "expo-web-browser";
import type { Client } from "./core/client";
import { Button, ErrorNotice, Input, Label, Sheet, useAction } from "./ui";
import { connectorAuthFinished, type ConnectorAuthState } from "../../shared/connector-auth";

export function ConnectorAuthFlow({ client, initial, onDone, onClose }: {
  client: Client; initial: ConnectorAuthState; onDone(): void; onClose(): void;
}) {
  const [state, setState] = useState(initial);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pollError, setPollError] = useState("");
  const action = useAction();
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await client.request<ConnectorAuthState>(`/api/connectors/auth/${initial.id}`);
        if (!active) return;
        setState(next); setPollError("");
        if (connectorAuthFinished(next)) {
          if (next.kind === "connected") onDone();
          return;
        }
      } catch (e) { if (active) setPollError(e instanceof Error ? e.message : "Could not check connection"); }
      if (active) timer = setTimeout(poll, 2_000);
    };
    timer = setTimeout(poll, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [initial.id, client]);
  const submit = () => action.run(async () => {
    const next = await client.request<ConnectorAuthState>(`/api/connectors/auth/${state.id}`, "POST", values);
    setValues({}); setState(next);
  });
  return <Sheet title={`Connect ${state.slug}`} onClose={onClose} closeLabel="Close">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 16 }}>
      {state.alias && <Label bold>{state.alias}</Label>}
      {state.kind === "pending" && <Label>Preparing the connection…</Label>}
      {state.kind === "form" && <>
        {state.fields?.map(field => <Input key={field.key} label={field.label} secureTextEntry={field.secret} autoCapitalize="none" autoCorrect={false} value={values[field.key] ?? ""} onChangeText={text => setValues(v => ({ ...v, [field.key]: text }))} />)}
        {state.helpUrl && <Button title="Provider setup instructions" text onPress={() => void WebBrowser.openBrowserAsync(state.helpUrl!)} />}
        <Button title="Connect" disabled={action.busy} onPress={() => void submit()} />
      </>}
      {state.kind === "browser" && <>
        <Button title="Open sign-in link" disabled={action.busy} onPress={() => void action.run(async () => {
          const url = new URL(state.url!);
          if (url.protocol !== "https:" || url.username || url.password) throw new Error("This sign-in link requires a secure browser on the host computer.");
          await WebBrowser.openBrowserAsync(url.href);
        })} />
        <Label>Complete sign-in in your browser, then return here.</Label>
        {state.manualCallback && <>
          <Label>If the localhost page cannot open on this phone, copy its complete address from the browser and paste it below.</Label>
          <Input label="Callback address" secureTextEntry autoCapitalize="none" autoCorrect={false} value={values.callbackUrl ?? ""} onChangeText={callbackUrl => setValues({ callbackUrl })} />
          <Button title="Finish sign-in" disabled={action.busy} onPress={() => void submit()} />
        </>}
      </>}
      {state.kind === "qr" && <Label>Open this workspace’s Connected Apps on a desktop or another screen, then choose Connect for {state.slug}{state.alias ? ` (${state.alias})` : ""}. Scan the code there using the provider app on this phone. This screen will update when pairing completes.</Label>}
      {state.kind === "connected" && <Label>Connected. Choose which bots may use this account in its access controls.</Label>}
      <ErrorNotice error={action.error || pollError || state.error} />
      {!connectorAuthFinished(state) && <Button title="Cancel connection" text disabled={action.busy} onPress={() => void action.run(async () => {
        await client.request(`/api/connectors/auth/${state.id}`, "DELETE"); onClose();
      })} />}
    </ScrollView>
  </Sheet>;
}
