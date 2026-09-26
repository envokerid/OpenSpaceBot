import React, { useState, useSyncExternalStore } from "react";
import { ScrollView, View } from "react-native";
import type { Session } from "./core/session";
import { routeId } from "./core/client";
import { canAdminister } from "./core/types";
import {
  Button,
  ErrorNotice,
  IconButton,
  Input,
  Label,
  Row,
  Sheet,
  useAction,
} from "./ui";

/** Account aliases are labels only; grants always use the stable account ID. */
export function ConnectorAccountBots({
  session,
  slug,
  appName,
  account,
  authoritative,
}: {
  session: Session;
  slug: string;
  appName: string;
  account: {
    id: string;
    alias?: string;
    label?: string;
    name?: string;
    status: string;
  };
  authoritative: boolean;
}) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const action = useAction();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const bots = state.bots.filter((bot) => !bot.hidden);
  const approved = bots.filter((bot) =>
    bot.connectorAccounts?.[slug]?.includes(account.id),
  );
  const available = bots.filter(
    (bot) => !bot.connectorAccounts?.[slug]?.includes(account.id),
  );
  const matches = available.filter((bot) =>
    bot.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const label = account.alias || account.label || account.name || account.id;
  const admin = canAdminister(session.client.connection);
  const canAdd = admin && authoritative && /^active$/i.test(account.status);
  const update = (botId: string, approve: boolean) =>
    action.run(async () => {
      if (!admin || (approve && !canAdd))
        throw new Error(
          "Choose an active, verified account before adding bots.",
        );
      await session.client.request(
        `/api/bots/${routeId(botId)}/connector-accounts/${routeId(slug)}/${routeId(account.id)}`,
        approve ? "POST" : "DELETE",
      );
      // Also refresh when the event stream is reconnecting, so a successful save
      // never depends on receiving an SSE frame to update the visible approvals.
      await session.refresh();
      if (approve) setAdding(false);
    });
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Label size={12} muted>
          Approved bots
        </Label>
        <IconButton
          icon="add"
          label={`Add bots to ${appName} ${label}`}
          chrome={false}
          disabled={action.busy || !canAdd}
          onPress={() => {
            action.clearError();
            setQuery("");
            setAdding(true);
          }}
        />
      </Row>
      {!approved.length && (
        <Label size={13} muted>
          No bots approved.
        </Label>
      )}
      {approved.map((bot) => (
        <Row key={bot.id} style={{ flexWrap: "nowrap" }}>
          <Label size={14} style={{ flex: 1 }}>
            {bot.name}
            {bot.composio === false ? " (disabled)" : ""}
          </Label>
          <IconButton
            icon="close"
            label={`Remove ${bot.name} from ${appName} ${label}`}
            chrome={false}
            disabled={action.busy || !admin}
            onPress={() => void update(bot.id, false)}
          />
        </Row>
      ))}
      {!admin ? (
        <Label size={12} muted>
          An administrator can manage bot access.
        </Label>
      ) : (
        !canAdd && (
          <Label size={12} muted>
            {authoritative
              ? "Bots can be added once this account is active."
              : "Refresh account status before adding bots."}
          </Label>
        )
      )}
      <ErrorNotice error={action.error} />
      {adding && (
        <Sheet
          title={`Add bots to ${label}`}
          onClose={() => {
            if (!action.busy) setAdding(false);
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, gap: 12 }}
          >
            <Label muted>
              {appName} · {label}
            </Label>
            <Label size={13} muted>
              Choose a bot to give it access to this account. Adding a bot also
              enables its connected apps.
            </Label>
            <Input
              label="Search bots"
              value={query}
              onChangeText={setQuery}
              editable={!action.busy}
            />
            <ErrorNotice error={action.error} />
            {!available.length ? (
              <Label muted>
                {bots.length
                  ? "All bots are approved."
                  : "Create a bot before assigning account access."}
              </Label>
            ) : !matches.length ? (
              <Label muted>No bots match your search.</Label>
            ) : (
              matches.map((bot) => (
                <Button
                  key={bot.id}
                  title={bot.name}
                  disabled={action.busy || !canAdd}
                  onPress={() => void update(bot.id, true)}
                />
              ))
            )}
            {action.busy && (
              <Label accessibilityLiveRegion="polite" muted>
                Saving bot access…
              </Label>
            )}
          </ScrollView>
        </Sheet>
      )}
    </View>
  );
}
