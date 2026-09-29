import { WorkspaceSettings } from "./settings/WorkspaceSettings";
import { skins } from "./core/skins";
import { Choice, IconButton, SettingsSurface } from "./ui";
import { Icon, type IconName } from "./Icon";
import { Toggle } from "./settings/shared";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, BackHandler, Linking, Pressable, View } from "react-native";
import type { Session } from "./core/session";
import type { Connection } from "./core/types";
import type { Preferences } from "./storage";
import { endpoint } from "./core/pairing";
import { QuickReplies } from "./QuickReplies";
import { notifications } from "./notifications";
import {
  Button,
  DialogBody,
  ErrorNotice,
  Header,
  Input,
  Label,
  Page,
  Row,
  Section,
  SettingRow,
  Sheet,
  useAction,
  useTheme,
} from "./ui";

export const notificationsFooter =
  "Approvals and finished work appear while OpenMausMobile is connected, including frames replayed after a short background pause. Closed-app push needs a separate push-relay release that does not exist yet.";
type HomeSetting = {
  title: string;
  icon: IconName;
  value?: string;
  onPress: () => void;
};

function SettingsGroup({ items }: { items: HomeSetting[] }) {
  const c = useTheme();
  return (
    <View
      style={{
        backgroundColor: "#000000",
        borderRadius: 20,
        overflow: "hidden",
      }}
    >
      {items.map((item, index) => (
        <Pressable
          key={item.title}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          onPress={item.onPress}
          style={({ pressed }) => ({
            minHeight: 68,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.dark ? "#080808" : "#BDBDBD",
            }}
          >
            <Icon name={item.icon} size={18} color="#FFFFFF" />
          </View>
          <Label size={15} style={{ flex: 1, lineHeight: 21, color: "#FFFFFF" }}>
            {item.title}
          </Label>
          {item.value && (
            <Label size={12} muted numberOfLines={1} style={{ maxWidth: "34%", color: "#A7A7A7" }}>
              {item.value}
            </Label>
          )}
          <Icon name="chevron" size={17} color="#FFFFFF" />
          {index < items.length - 1 && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 61,
                right: 14,
                bottom: 0,
                height: 1,
                backgroundColor: "#303030",
              }}
            />
          )}
        </Pressable>
      ))}
    </View>
  );
}

export function Settings(props: React.ComponentProps<typeof SettingsContent>) {
  return (
    <SettingsSurface>
      <SettingsContent {...props} />
    </SettingsSurface>
  );
}
function SettingsContent({
  session,
  all,
  prefs,
  onPreferences,
  onBack,
  onPair,
  onUse,
  onForget,
  onEdit,
  onRoutines,
  onApps,
  onWelcome,
}: {
  session?: Session;
  all: Connection[];
  prefs: Preferences;
  onPreferences: (p: Preferences) => void;
  onBack: () => void;
  onPair: () => void;
  onUse: (c: Connection) => Promise<void>;
  onForget: (c: Connection) => Promise<void>;
  onEdit: (c: Connection) => Promise<void>;
  onRoutines?: () => void;
  onApps?: () => void;
  onWelcome?: () => void;
}) {
  const [workspace, setWorkspace] = useState<"index" | "approvedCommands">();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<
    | "computer"
    | "notifications"
    | "background"
    | "appearance"
    | "chat"
    | "about"
  >();
  const pageTitles = {
    computer: "Computers",
    notifications: "Notifications",
    background: "Background connection",
    appearance: "Appearance",
    chat: "Chat",
    about: "About",
  };
  useEffect(() => {
    if (workspace) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (page) {
          setPage(undefined);
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [page, workspace]);
  const connectionStatus = useSyncExternalStore(
    session?.subscribe ?? (() => () => {}),
    () => session?.snapshot().status ?? "offline",
  );
  const c = useTheme();
  const action = useAction();
  const connection = session?.client.connection;
  const [modal, setModal] = useState<"address" | "replies">();
  const [address, setAddress] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [askable, setAskable] = useState(true);
  useEffect(() => {
    void notifications?.getPermissionsAsync().then((p) => {
      setAllowed(p.granted);
      setAskable(p.canAskAgain);
    });
  }, []);
  const [forgetting, setForgetting] = useState<Connection>();
  const forget = (item: Connection) => setForgetting(item);
  const homeGroups: HomeSetting[][] = [
    [
      ...(session
        ? [
            {
              title: "Workspace settings",
              icon: "settings" as const,
              onPress: () => setWorkspace("index"),
            },
            {
              title: "Approved commands",
              icon: "checkCircle" as const,
              onPress: () => setWorkspace("approvedCommands"),
            },
          ]
        : []),
      ...(onRoutines
        ? [
            {
              title: "Threads & Routines",
              icon: "schedule" as const,
              onPress: onRoutines,
            },
          ]
        : []),
      ...(onApps
        ? [
            {
              title: "Connected Apps",
              icon: "hub" as const,
              onPress: onApps,
            },
          ]
        : []),
      {
        title: "Computers",
        icon: "computer",
        value: String(all.length),
        onPress: () => setPage("computer"),
      },
    ],
    [
      {
        title: "Notifications",
        icon: "bell",
        value: allowed ? "On" : "Off",
        onPress: () => setPage("notifications"),
      },
      {
        title: "Background connection",
        icon: "phone",
        onPress: () => setPage("background"),
      },
      {
        title: "Appearance",
        icon: "theme",
        value: (prefs.skin ?? "system").replace(/^./, (x) => x.toUpperCase()),
        onPress: () => setPage("appearance"),
      },
      {
        title: "Chat",
        icon: "chat",
        onPress: () => setPage("chat"),
      },
    ],
    [
      {
        title: "About",
        icon: "info",
        value: "0.1.0",
        onPress: () => setPage("about"),
      },
      {
        title: connection ? "Connect another computer" : "Connect a computer",
        icon: "add",
        onPress: onPair,
      },
    ],
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleHomeGroups = homeGroups
    .map((items) =>
      normalizedQuery
        ? items.filter((item) =>
            `${item.title} ${item.value ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery),
          )
        : items,
    )
    .filter((items) => items.length);

  if (workspace && session)
    return (
      <WorkspaceSettings
        key={`${session.client.connection.id}:${session.client.connection.endpoint.url}`}
        session={session}
        initialSection={workspace === "approvedCommands" ? workspace : undefined}
        onBack={() => setWorkspace(undefined)}
      />
    );
  return (
    <View style={{ flex: 1 }}>
      <Header
        title={page ? pageTitles[page] : "Settings"}
        onBack={() => (page ? setPage(undefined) : onBack())}
        trailing={
          !page ? (
            <IconButton
              icon={searching ? "close" : "search"}
              label={searching ? "Close search" : "Search settings"}
              onPress={() => {
                setSearching((value) => !value);
                if (searching) setQuery("");
              }}
              size={48}
              glyph={20}
              surface={c.sheet}
              elevation={0}
            />
          ) : undefined
        }
      />
      <Page key={page ?? "home"}>
        <ErrorNotice error={action.error} />
        {!page && (
          <>
            {searching && (
              <Input
                accessibilityLabel="Search settings"
                autoFocus
                placeholder="Search settings"
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
              />
            )}
            {visibleHomeGroups.map((items, index) => (
              <SettingsGroup key={index} items={items} />
            ))}
            {normalizedQuery && !visibleHomeGroups.length && (
              <Label muted style={{ textAlign: "center", paddingVertical: 24 }}>
                No settings found.
              </Label>
            )}
          </>
        )}
        {page === "computer" && (
          <>
            <Section title="">
              {connection ? (
                <>
                  <SettingRow title="Name" value={connection.name} />
                  <View style={{ gap: 4 }}>
                    <Label muted>Address</Label>
                    <Label
                      size={13}
                      muted
                      numberOfLines={expanded ? undefined : 1}
                      selectable={expanded}
                      style={{ fontFamily: "monospace", letterSpacing: 0 }}
                    >
                      {expanded
                        ? connection.endpoint.url.replace(/^http:\/\//, "")
                        : connection.endpoint.url
                            .replace(/^http:\/\//, "")
                            .replace(/^(.{8}).*(.{6})$/, "$1…$2")}
                    </Label>
                    <Row style={{ gap: 4 }}>
                      <Button
                        title={
                          expanded ? "Hide full address" : "Show full address"
                        }
                        text
                        style={{ paddingHorizontal: 12, minHeight: 48 }}
                        onPress={() => setExpanded(!expanded)}
                      />
                      <Button
                        title={copied ? "Copied" : "Copy"}
                        text
                        style={{ paddingHorizontal: 12, minHeight: 48 }}
                        onPress={() => {
                          void import("expo-clipboard").then((c) =>
                            c.setStringAsync(connection.endpoint.url),
                          );
                          setCopied(true);
                        }}
                      />
                    </Row>
                  </View>
                  <SettingRow
                    title="Edit address"
                    onPress={() => {
                      setAddress(
                        connection.endpoint.url.replace(/^http:\/\//, ""),
                      );
                      setModal("address");
                    }}
                  />
                </>
              ) : (
                <SettingRow title="Connect a computer" onPress={onPair} />
              )}
              <SettingRow
                title="Connection"
                value={
                  !session
                    ? "Not paired"
                    : connectionStatus === "connected"
                      ? "Connected"
                      : connectionStatus === "connecting"
                        ? "Connecting…"
                        : (session.snapshot().error ?? "Offline")
                }
              />
              {connection && (
                <SettingRow title="Connect another computer" onPress={onPair} />
              )}
            </Section>
            {!!all.filter((i) => i.id !== connection?.id).length && (
              <Section title="Other computers">
                {all
                  .filter((i) => i.id !== connection?.id)
                  .map((i) => (
                    <View key={i.id}>
                      <SettingRow
                        title={`Use ${i.name}`}
                        onPress={() => void action.run(() => onUse(i))}
                      />
                      <SettingRow
                        title={`Remove ${i.name}`}
                        danger
                        onPress={() => forget(i)}
                      />
                    </View>
                  ))}
                <Label size={13} muted>
                  Each computer is paired separately. Only the selected computer
                  is active at a time.
                </Label>
              </Section>
            )}
            {session && (
              <Section title="Troubleshooting">
                <Label size={13} muted>
                  {connectionStatus === "connected"
                    ? "This computer is connected and responding normally."
                    : (session.snapshot().error ??
                      "Check that OpenMausBot is open on your computer and both devices can reach the same network.")}
                </Label>
                <SettingRow
                  title="Try reconnecting"
                  onPress={() => session.start()}
                />
              </Section>
            )}
            {connection && (
              <Section title="">
                <SettingRow
                  title={
                    all.length > 1
                      ? "Remove this computer"
                      : "Unpair this phone"
                  }
                  danger
                  onPress={() => forget(connection)}
                />
                <Label size={13} muted>
                  Removes the pairing from this phone only. To stop it reaching
                  the computer at all, remove the device in OpenMausBot →
                  Settings → Phone.
                </Label>
              </Section>
            )}
          </>
        )}
        {page === "notifications" && (
          <>
            <Section title="">
              <SettingRow
                title="Status"
                value={
                  allowed
                    ? "Allowed"
                    : askable
                      ? "Not allowed"
                      : "Turned off in system settings"
                }
              />
              <SettingRow
                title={
                  allowed
                    ? "Notifications are on"
                    : askable
                      ? "Enable notifications"
                      : "Open notification settings"
                }
                onPress={
                  allowed
                    ? undefined
                    : () =>
                        void action.run(async () => {
                          if (!notifications) {
                            Alert.alert(
                              "Notifications",
                              "Notifications require the OpenMausBot development build. Expo Go does not support this feature.",
                            );
                            return;
                          }
                          if (!askable) {
                            await Linking.openSettings();
                            return;
                          }
                          const p =
                            await notifications.requestPermissionsAsync();
                          setAllowed(p.granted);
                          setAskable(p.canAskAgain);
                        })
                }
              />
              <Label size={13} muted>
                {notificationsFooter}
              </Label>
            </Section>
          </>
        )}
        {page === "background" && (
          <>
            <Section title="">
              <SettingRow title="Status" value="Only while open" />
              <SettingRow
                title="Turn on"
                onPress={() =>
                  Alert.alert(
                    "Background connection",
                    "A persistent background connection requires a native foreground service. This Expo build receives updates while open and replays missed updates when it reconnects.",
                  )
                }
              />
              <Label size={13} muted>
                Notifications only arrive while the app is open or was recently
                backgrounded. The workspace continues running on your computer
                while this phone is disconnected.
              </Label>
            </Section>
          </>
        )}
        {page === "appearance" && (
          <>
            <Section title="">
              <Choice
                label="Color theme"
                value={prefs.skin ?? "system"}
                options={[
                  { id: "system", label: "Follow system" },
                  ...Object.keys(skins).map((id) => ({
                    id,
                    label: id[0].toUpperCase() + id.slice(1),
                  })),
                ]}
                onChange={(skin) => {
                  if (skin === "system" || skin in skins)
                    onPreferences({
                      ...prefs,
                      skin: skin as Preferences["skin"],
                    });
                }}
              />
              <Toggle
                title="Show thread activity on home"
                value={prefs.showThreads !== false}
                onChange={(showThreads) =>
                  onPreferences({ ...prefs, showThreads })
                }
              />
            </Section>
          </>
        )}
        {page === "chat" && (
          <>
            <Section title="">
              <SettingRow
                title="Quick replies"
                icon="chat"
                iconColor="#05AADB"
                onPress={() => {
                  setModal("replies");
                }}
              />
              <Label size={13} muted>
                Bots show an animated avatar while working. Tool calls and step runs stay hidden.
              </Label>
            </Section>
          </>
        )}
        {page === "about" && (
          <>
            <Section title="">
              <Label muted>OpenMausBot Expo · 0.1.0</Label>
              <Label size={13} muted>
                This mobile app does not collect usage analytics. Mobile updates
                are installed through your app distribution channel.
              </Label>
              {onWelcome && (
                <SettingRow title="Replay welcome" onPress={onWelcome} />
              )}
            </Section>
          </>
        )}
      </Page>
      {forgetting && (
        <Sheet
          centered
          title={
            all.length > 1 ? `Remove ${forgetting.name}?` : "Unpair this phone?"
          }
          onClose={() => setForgetting(undefined)}
        >
          <DialogBody
            actions={
              <>
                <Button
                  title="Cancel"
                  text
                  onPress={() => setForgetting(undefined)}
                />
                <Button
                  title={all.length > 1 ? "Remove" : "Unpair"}
                  danger
                  text
                  disabled={action.busy}
                  onPress={() =>
                    void action.run(async () => {
                      await onForget(forgetting);
                      setForgetting(undefined);
                    })
                  }
                />
              </>
            }
          >
            <Label muted>
              {all.length > 1
                ? "This removes the saved connection from this phone only. Another saved computer will stay available."
                : "You'll need a new pairing code to connect again."}
            </Label>
            <ErrorNotice error={action.error} />
          </DialogBody>
        </Sheet>
      )}
      {modal === "address" && (
        <Sheet
          centered
          title="Edit address"
          onClose={() => setModal(undefined)}
        >
          <DialogBody
            actions={
              <>
                <Button
                  title="Cancel"
                  text
                  onPress={() => setModal(undefined)}
                />
                <Button
                  title="Save"
                  text
                  onPress={() =>
                    void action.run(async () => {
                      if (!connection) return;
                      const e = endpoint(address);
                      await onEdit({
                        ...connection,
                        endpoint: e,
                        endpoints: [e],
                      });
                      setModal(undefined);
                    })
                  }
                />
              </>
            }
          >
            <Label muted>
              Enter whatever Phone settings on your computer shows. The pairing
              itself is kept.
            </Label>
            <Input
              style={{ fontSize: 14, letterSpacing: 0 }}
              value={address}
              onChangeText={setAddress}
              autoCapitalize="none"
              placeholder="https://mac.example or 192.168.1.42:8810"
            />
            <ErrorNotice error={action.error} />
          </DialogBody>
        </Sheet>
      )}
      {modal === "replies" && (
        <QuickReplies
          replies={prefs.quickReplies}
          onChange={(quickReplies) => onPreferences({ ...prefs, quickReplies })}
          onClose={() => setModal(undefined)}
        />
      )}
    </View>
  );
}
