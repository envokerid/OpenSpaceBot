import React, { useEffect, useState } from "react";
import { AppState, RefreshControl, ScrollView, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ConnectorAccountBots } from "./ConnectorAccountBots";
import type { Session } from "./core/session";
import { routeId } from "./core/client";
import {
  Button,
  Card,
  ErrorNotice,
  Header,
  IconButton,
  Input,
  Label,
  Row,
  SettingsSurface,
  Sheet,
  useAction,
} from "./ui";
interface Connector {
  slug: string;
  label: string;
  blurb: string;
}
interface Account {
  id: string;
  alias?: string;
  label?: string;
  name?: string;
  status: string;
}
interface Status {
  connected?: boolean;
  pending?: boolean;
  accounts?: Account[];
}
interface Inventory {
  services: Record<string, Status>;
  credentialStore?: string;
}
export function ConnectedApps(props: React.ComponentProps<typeof ConnectedAppsContent>) {
  return (
    <SettingsSurface>
      <ConnectedAppsContent {...props} />
    </SettingsSurface>
  );
}
function ConnectedAppsContent({
  session,
  onBack,
}: {
  session: Session;
  onBack: () => void;
}) {
  const [catalog, setCatalog] = useState<{
    cards: Connector[];
    configured: boolean;
  }>();
  const [inventory, setInventory] = useState<Inventory>();
  const [unreadable, setUnreadable] = useState(false);
  const [query, setQuery] = useState("");
  const [aliasTarget, setAliasTarget] = useState<Connector>();
  const [alias, setAlias] = useState("");
  const action = useAction();
  const refresh = () =>
    action.run(async () => {
      const [cards, response] = await Promise.all([
        session.client.request<{ cards: Connector[]; configured: boolean }>(
          "/api/connectors/catalog",
        ),
        session.client.request<Inventory>("/api/connectors/connected"),
        session.refresh(),
      ]);
      setCatalog(cards);
      setUnreadable(response.credentialStore === "unavailable");
      if (response.credentialStore !== "unavailable") setInventory(response);
    });
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => sub.remove();
  }, []);
  const authorize = (card: Connector, accountAlias?: string) =>
    action.run(async () => {
      const { url } = await session.client.request<{ url: string }>(
        `/api/connectors/${routeId(card.slug)}/authorize`,
        "POST",
        accountAlias ? { alias: accountAlias } : {},
      );
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        throw new Error("The computer returned an invalid sign-in URL.");
      setAliasTarget(undefined);
      await WebBrowser.openBrowserAsync(url);
    });
  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Connected Apps"
        onBack={onBack}
        trailing={
          <IconButton
            icon="refresh"
            label={action.busy ? "Refreshing…" : "Refresh apps"}
            disabled={action.busy}
            size={48}
            glyph={20}
            surface="transparent"
            elevation={0}
            onPress={() => void refresh()}
          />
        }
      />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={action.busy}
            onRefresh={() => void refresh()}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 16,
          gap: 16,
        }}
      >
        <Input label="Search apps" value={query} onChangeText={setQuery} />
        <ErrorNotice error={action.error} />
        {unreadable ? (
          <Card gap={6}>
            <Label bold>Accounts could not be re-checked</Label>
            <Label size={13} muted>
              {inventory ? "Showing what was connected last time. " : ""}Your
              computer could not open its credential store just now, so these
              accounts could not be re-checked. Nothing has been disconnected —
              restarting OpenMausBot on your computer usually clears this.
            </Label>
          </Card>
        ) : (
          catalog?.configured === false && (
            <Card gap={6}>
              <Label size={16} bold>
                Connected apps need setup
              </Label>
              <Label size={13} muted>
                Configure Composio on your computer first. Provider credentials
                are never returned to this phone.
              </Label>
            </Card>
          )
        )}
        {catalog?.cards
          .filter((card) =>
            `${card.label} ${card.slug}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
          )
          .map((card) => {
            const status = inventory?.services[card.slug];
            const accounts = status?.accounts ?? [];
            return (
              <Card key={card.slug}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Label size={16} bold>
                      {card.label}
                    </Label>
                    <Label size={13} muted>
                      {card.blurb}
                    </Label>
                  </View>
                  {status?.pending && (
                    <Label size={13} muted>
                      Connecting…
                    </Label>
                  )}
                </Row>
                {!inventory ? (
                  <Label muted>Connection unknown</Label>
                ) : !accounts.length &&
                  !status?.connected &&
                  !status?.pending ? (
                  <Button
                    title={`Connect ${card.label}`}
                    primary
                    disabled={!catalog.configured || action.busy}
                    style={{ alignSelf: "flex-start", marginVertical: 4 }}
                    onPress={() => void authorize(card)}
                  />
                ) : !accounts.length ? (
                  <>
                    <Label>
                      {status?.pending ? "Connecting…" : "Connected"}
                    </Label>
                    <Label size={13} muted>
                      Account details are unavailable from this provider.
                      Refresh after authorization finishes.
                    </Label>
                  </>
                ) : (
                  <>
                    {accounts.map((account) => (
                      <View key={account.id} style={{ gap: 6 }}>
                        <Row>
                          <View style={{ flex: 1 }}>
                            <Label>
                              {account.alias ||
                                account.label ||
                                account.name ||
                                "Primary account"}
                            </Label>
                            <Label size={12} muted>
                              {account.status
                                .replaceAll("_", " ")
                                .toLowerCase()}
                            </Label>
                            <Label size={11} muted selectable>
                              {account.id}
                            </Label>
                          </View>
                          <Label size={12} muted>
                            {account.status.toLowerCase() === "active"
                              ? "Active"
                              : "Pending"}
                          </Label>
                        </Row>
                        <ConnectorAccountBots
                          session={session}
                          slug={card.slug}
                          appName={card.label}
                          account={account}
                          authoritative={!unreadable && !action.error && !action.busy && !!catalog.configured}
                        />
                      </View>
                    ))}
                    <Button
                      title="Add another account"
                      text
                      disabled={accounts.length >= 5 || action.busy}
                      style={{ alignSelf: "flex-start" }}
                      onPress={() => {
                        setAlias("");
                        setAliasTarget(card);
                      }}
                    />
                  </>
                )}
              </Card>
            );
          })}
      </ScrollView>
      {aliasTarget && (
        <Sheet
          centered
          title={`Add another ${aliasTarget.label} account`}
          onClose={() => setAliasTarget(undefined)}
        >
          <View style={{ padding: 24, gap: 16 }}>
            <Input
              label="Account name"
              value={alias}
              onChangeText={setAlias}
              maxLength={64}
            />
            <Row style={{ justifyContent: "flex-end" }}>
              <Button
                title="Cancel"
                text
                onPress={() => setAliasTarget(undefined)}
              />
              <Button
                title="Continue"
                text
                disabled={!alias.trim()}
                onPress={() => void authorize(aliasTarget, alias.trim())}
              />
            </Row>
          </View>
        </Sheet>
      )}
    </View>
  );
}
