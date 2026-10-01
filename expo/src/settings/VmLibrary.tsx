import React, { useEffect, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import type { Client } from "../core/client";
import type {
  VmAccess,
  VmInstance,
  VmLibraryPayload,
  VmSubject,
} from "../../../shared/vm-library";
import {
  Button,
  Choice,
  ErrorNotice,
  Input,
  Label,
  RadioRow,
  Row,
  Section,
  SettingRow,
  useAction,
} from "../ui";
import { Form, Toggle } from "./shared";
import { vmAcceptsSubject } from "../../../shared/vm-assignment";

const key = (value: { kind: string; id: string }) =>
  `${value.kind}:${value.id}`;
function useLibrary(client: Client) {
  const [data, setData] = useState<VmLibraryPayload>();
  const action = useAction();
  const load = async () =>
    setData(await client.request<VmLibraryPayload>("/api/vms"));
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await client.request<VmLibraryPayload>("/api/vms");
        if (alive) setData(result);
      } catch {
        /* Manual refresh displays connection errors. */
      } finally {
        if (alive) timer = setTimeout(poll, 5000);
      }
    };
    void action.run(load);
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [client]);
  return { data, load, action };
}
function AssignmentForm({
  client,
  data,
  subject,
  reload,
}: {
  client: Client;
  data: VmLibraryPayload;
  subject: VmSubject;
  reload: () => Promise<void>;
}) {
  const selected =
    data.bindings.find((binding) => key(binding) === key(subject))?.vmId ?? "";
  const choices = data.instances.filter(
    (vm) =>
      vm.id === selected ||
      (subject.kind === "default"
        ? vm.access.mode === "shared"
        : vm.access.allBots ||
          vm.access.grants.some((grant) => key(grant) === key(subject))),
  );
  return (
    <Form
      key={`${key(subject)}:${selected}`}
      title={subject.kind === "group" ? "Group VM" : "VM assignment"}
      fields={[
        {
          key: "vmId",
          label: "Use VM",
          options: [
            {
              id: "",
              label:
                subject.kind === "group"
                  ? "Use each bot’s computer"
                  : subject.kind === "default"
                    ? "No default VM"
                    : "Use workspace default",
            },
            ...choices.map((vm) => ({
              id: vm.id,
              label: `${vm.name} · ${vm.access.mode} · ${vm.state}`,
            })),
          ],
        },
      ]}
      initial={{ vmId: selected }}
      onSave={async (values) => {
        await client.request(
          `/api/computer-bindings/${subject.kind}/${subject.id}`,
          "PUT",
          { revision: data.revision, vmId: values.vmId || null },
        );
        await reload();
      }}
    />
  );
}
export function VmAssignment({
  client,
  subject,
}: {
  client: Client;
  subject: VmSubject;
}) {
  const { data, load, action } = useLibrary(client);
  return (
    <View style={{ gap: 16 }}>
      <ErrorNotice error={action.error} />
      {data && (
        <AssignmentForm
          client={client}
          data={data}
          subject={subject}
          reload={load}
        />
      )}
      <Label muted>
        Manage VM creation and sharing in Settings → Computers. Group
        assignments apply only inside that group.
      </Label>
    </View>
  );
}
export function VmLibraryPanel({ client }: { client: Client }) {
  const { data, load, action } = useLibrary(client);
  const [selected, setSelected] = useState<string>();
  const [confirm, setConfirm] = useState("");
  const [form, setForm] = useState<{
    id?: string;
    name: string;
    access: VmAccess;
    revision: number;
    requestId: string;
  }>();
  const act = async (vm: VmInstance, operation: string) => {
    await client.request(`/api/vms/${vm.id}/actions`, "POST", {
      action: operation,
      requestId: Crypto.randomUUID(),
      revision: data!.revision,
      ...(operation === "delete" ? { confirmName: confirm } : {}),
    });
    await load();
  };
  const submit = async (start: boolean) => {
    if (!form) return;
    if (form.id)
      await client.request(`/api/vms/${form.id}`, "PATCH", {
        name: form.name,
        access: form.access,
        revision: form.revision,
      });
    else
      await client.request("/api/vms", "POST", {
        name: form.name,
        access: form.access,
        requestId: form.requestId,
        start,
      });
    setForm(undefined);
    await load();
  };
  const vm = data?.instances.find((vm) => vm.id === selected);
  return (
    <>
      <ErrorNotice error={action.error} />
      <Section title="Local VMs">
        <Label muted size={13}>
          Saved computers for your bots and groups. Apps and files remain when
          stopped or when a bot or group is deleted.
        </Label>
        {data ? (
          <>
            <SettingRow
              title="Saved VMs"
              value={`${data.instances.length} / ${data.limits.saved}`}
              icon="computer"
            />
            <SettingRow
              title="Running VMs"
              value={`${data.instances.filter((item) => item.state === "running").length} / ${data.limits.running}`}
            />
          </>
        ) : (
          <Label muted>Loading saved VMs…</Label>
        )}
        {data?.problem && (
          <Label muted size={13}>
            {data.problem}
          </Label>
        )}
        <Row>
          <Button
            title="New VM"
            primary
            disabled={action.busy || !data}
            onPress={() =>
              setForm({
                name: "",
                access: { mode: "shared", grants: [] },
                revision: data!.revision,
                requestId: Crypto.randomUUID(),
              })
            }
          />
          <Button
            title="Refresh"
            text
            disabled={action.busy}
            onPress={() => void action.run(load)}
          />
        </Row>
      </Section>
      {data && (
        <Section title="Saved VMs">
          {data.instances.length === 0 && (
            <Label muted size={13}>
              No saved VMs yet. Create a VM to get started.
            </Label>
          )}
          {data.instances.map((item) => (
            <View key={item.id} style={{ gap: 6 }}>
              <SettingRow
                title={item.name}
                icon="computer"
                value={selected === item.id ? "Selected" : undefined}
                subtitle={[
                  `${item.access.mode === "shared" ? "Shared" : "Isolated"} · ${item.operation?.state === "running" ? `${item.operation.action} in progress` : item.state} · ${item.holder ?? "Available"}`,
                  item.assignments
                    .map(
                      (binding) =>
                        data.subjects.find((s) => key(s) === key(binding))
                          ?.name ?? binding.kind,
                    )
                    .join(", ") || "Unassigned",
                ].join("\n")}
                onPress={() => {
                  setSelected(item.id);
                  setConfirm("");
                }}
              />
              {item.operation?.state === "failed" && (
                <ErrorNotice error={item.operation.error} />
              )}
            </View>
          ))}
        </Section>
      )}
      {vm && (
        <>
          <Section title={vm.name}>
            <SettingRow
              title="Resources"
              value="2 CPUs · 4 GiB"
              icon="computer"
            />
            <SettingRow
              title="Access"
              subtitle={
                vm.access.allBots
                  ? "All current and future bots"
                  : vm.access.grants
                      .map(
                        (grant) =>
                          data!.subjects.find((s) => key(s) === key(grant))
                            ?.name ?? "Deleted owner",
                      )
                      .join(", ") || "Unassigned"
              }
            />
            {vm.problem && <ErrorNotice error={vm.problem} />}
            {vm.canRetryCreate && (
              <Button
                title="Retry creation"
                disabled={action.busy || vm.inUse}
                onPress={() => void action.run(() => act(vm, "create"))}
              />
            )}
            <Row>
              <Button
                title={vm.state === "running" ? "Stop VM" : "Start VM"}
                primary
                disabled={
                  action.busy ||
                  vm.inUse ||
                  !data?.available ||
                  vm.state === "missing"
                }
                onPress={() =>
                  void action.run(() =>
                    act(vm, vm.state === "running" ? "stop" : "start"),
                  )
                }
              />
              <Button
                title="Reconnect control"
                disabled={action.busy || vm.inUse || vm.state !== "running"}
                onPress={() => void action.run(() => act(vm, "reconnect"))}
              />
            </Row>
            {vm.canRecreate && <>
              <Button
                title="Recreate · keep apps & files"
                disabled={action.busy || vm.inUse || vm.operation?.state === "running" || !data?.available}
                onPress={() => void action.run(() => act(vm, "recreate"))}
              />
              <Label>Recreate restarts the desktop and keeps installed apps, files, settings, and assignments. Save any open work first. A recovery copy is retained.</Label>
            </>}
            <Button
              title="Name & access"
              disabled={action.busy || vm.inUse}
              onPress={() =>
                setForm({
                  id: vm.id,
                  name: vm.name,
                  access: { ...vm.access, grants: [...vm.access.grants] },
                  revision: data!.revision,
                  requestId: Crypto.randomUUID(),
                })
              }
            />
          </Section>
          <Section title="Default assignments">
            <Toggle title="Workspace default VM"
              value={data!.bindings.some(binding => binding.kind === "default" && binding.vmId === vm.id)}
              disabled={action.busy || vm.inUse || vm.operation?.state === "running" || vm.access.mode !== "shared"}
              onChange={checked => void action.run(async () => {
                await client.request("/api/computer-bindings/default/workspace", "PUT", { revision: data!.revision, vmId: checked ? vm.id : null });
                await load();
              })} />
            <Label muted size={13}>{vm.access.mode === "isolated" ? "Only shared VMs can be the workspace default." : "Bots with access inherit this VM when they have no personal assignment."}</Label>
            {data!.subjects.map(subject => {
              const binding = data!.bindings.find(binding => key(binding) === key(subject));
              const checked = binding?.vmId === vm.id;
              const allowed = vmAcceptsSubject(vm, subject);
              const previous = data!.instances.find(item => item.id === binding?.vmId);
              return <View key={key(subject)} style={{ gap: 4 }}>
                <Toggle title={`${subject.name} · ${subject.kind}`} value={checked}
                  disabled={action.busy || vm.inUse || vm.operation?.state === "running" || (!checked && !allowed)}
                  onChange={next => void action.run(async () => {
                    await client.request(`/api/computer-bindings/${subject.kind}/${subject.id}`, "PUT", { revision: data!.revision, vmId: next ? vm.id : null });
                    await load();
                  })} />
                <Label muted size={12}>{!allowed ? "Enable access in Name & access first" : previous && !checked ? `Currently assigned to ${previous.name}` : checked ? "Assigned to this VM" : subject.kind === "bot" && data!.bindings.some(item => item.kind === "default" && item.vmId === vm.id) ? "Uses this VM through workspace default" : "Not assigned"}</Label>
              </View>;
            })}
            <Label muted size={13}>A bot or group can access several VMs through Name & access. These switches choose one default; the bot can select another permitted VM during work. Computer Off is respected.</Label>
          </Section>
          <Section title="Recent activity">
            {vm.activity.length === 0 && (
              <Label muted size={13}>
                No activity yet.
              </Label>
            )}
            {vm.activity
              .slice(-5)
              .reverse()
              .map((event, i) => (
                <SettingRow
                  key={i}
                  title={event.message}
                  subtitle={new Date(event.at).toLocaleString()}
                />
              ))}
          </Section>
          <Section title="Delete VM">
            <Label muted size={13}>
              Deletes the active VM disk and clears{" "}
              {vm.assignments.length} assignments. Its workspace folder and any earlier recovery copies remain.
            </Label>
            <Input
              label="Type VM name to delete"
              placeholder={vm.name}
              value={confirm}
              onChangeText={setConfirm}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Delete VM"
              danger
              disabled={action.busy || vm.inUse || confirm !== vm.name}
              onPress={() => void action.run(() => act(vm, "delete"))}
            />
          </Section>
        </>
      )}
      {form && (
        <Section title={form.id ? "Edit VM" : "New VM"}>
          <Input
            label="VM name"
            placeholder="VM name"
            value={form.name}
            onChangeText={(name) => setForm({ ...form, name })}
            maxLength={80}
          />
          <Choice
            label="Access mode"
            value={form.access.mode}
            options={[
              { id: "shared", label: "Shared" },
              { id: "isolated", label: "Isolated" },
            ]}
            onChange={(mode) =>
              setForm({
                ...form,
                access: { mode: mode as VmAccess["mode"], grants: [] },
              })
            }
          />
          <Label muted size={13}>
            Sharing includes installed apps, files, and browser sessions. A
            group's isolated VM is available only inside that group.
          </Label>
          {form.access.mode === "shared" && (
            <Toggle
              title="All current and future bots"
              value={!!form.access.allBots}
              onChange={(allBots) =>
                setForm({ ...form, access: { ...form.access, allBots } })
              }
            />
          )}
          <Section
            title={form.access.mode === "isolated" ? "Owner" : "Bots & groups"}
          >
            {data?.subjects.length === 0 && (
              <Label muted size={13}>
                No bots or groups yet.
              </Label>
            )}
            {data?.subjects.map((item) => {
              const checked = form.access.grants.some(
                (grant) => key(grant) === key(item),
              );
              const title = `${item.name} · ${item.kind === "bot" ? "Bot" : "Group"}`;
              const onChange = () =>
                setForm({
                  ...form,
                  access: {
                    ...form.access,
                    grants:
                      form.access.mode === "isolated"
                        ? [{ kind: item.kind, id: item.id }]
                        : checked
                          ? form.access.grants.filter(
                              (grant) => key(grant) !== key(item),
                            )
                          : [
                              ...form.access.grants,
                              { kind: item.kind, id: item.id },
                            ],
                  },
                });
              return form.access.mode === "isolated" ? (
                <RadioRow
                  key={key(item)}
                  title={title}
                  selected={checked}
                  onPress={onChange}
                />
              ) : (
                <Toggle
                  key={key(item)}
                  title={title}
                  value={checked}
                  onChange={onChange}
                />
              );
            })}
          </Section>
          <Button
            title={form.id ? "Save" : "Create & start"}
            primary
            disabled={action.busy || !form.name.trim()}
            onPress={() => void action.run(() => submit(true))}
          />
          {!form.id && (
            <Button
              title="Create stopped"
              disabled={action.busy || !form.name.trim()}
              onPress={() => void action.run(() => submit(false))}
            />
          )}
          <Button title="Cancel" text onPress={() => setForm(undefined)} />
        </Section>
      )}
      {data && (
        <>
          <Form
            title="VM capacity"
            fields={[
              { key: "saved", label: "Maximum saved VMs" },
              { key: "running", label: "Maximum running VMs" },
            ]}
            initial={{
              saved: String(data.limits.saved),
              running: String(data.limits.running),
            }}
            onSave={async (values) => {
              await client.request("/api/vms/limits", "PATCH", {
                revision: data.revision,
                saved: Number(values.saved),
                running: Number(values.running),
              });
              await load();
            }}
          />
        </>
      )}
    </>
  );
}
