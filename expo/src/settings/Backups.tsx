import React, { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { randomUUID } from "expo-crypto";
import type { WorkspaceBackupSummary } from "../../../shared/workspace-backup";
import { Button, ErrorNotice, Input, Label, Section } from "../ui";
import { useResource, type SettingsProps } from "./shared";

export function BackupSettings({ client }: SettingsProps) {
  const { data, load, action } = useResource<{
    busy: boolean;
    pendingRestore?: boolean;
  }>(client, "/api/workspace-backup/status");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset>();
  const [preview, setPreview] = useState<{
    id: string;
    summary: WorkspaceBackupSummary;
  }>();
  const [confirmation, setConfirmation] = useState("");
  const [exported, setExported] = useState<{ id: string; filename: string }>();
  const disabled = action.busy || !data || data.busy || data.pendingRestore;
  const download = async (result: { id: string; filename: string }) => {
    if (!FileSystem.cacheDirectory)
      throw new Error("File downloads require a native build.");
    const target =
      FileSystem.cacheDirectory +
      randomUUID() +
      "-" +
      result.filename.replace(/[^\w.-]/g, "_");
    try {
      const response = await FileSystem.downloadAsync(
        `${client.connection.endpoint.url}/api/workspace-backup/download/${encodeURIComponent(result.id)}`,
        target,
        { headers: { Authorization: `Bearer ${client.token}` } },
      );
      if (response.status !== 200)
        throw new Error(`Backup download failed (${response.status}).`);
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("File sharing is unavailable.");
      await Sharing.shareAsync(target, { dialogTitle: result.filename });
    } finally {
      await FileSystem.deleteAsync(target, { idempotent: true });
    }
  };
  return (
    <>
      <ErrorNotice error={action.error} />
      <Button
        title="Refresh backup status"
        disabled={action.busy}
        onPress={() => void action.run(load)}
      />
      {data?.busy && (
        <Label muted>A backup operation is already running.</Label>
      )}
      {data?.pendingRestore && (
        <Label>
          A restore is pending. Restart the connected computer's OpenMausBot app
          to finish.
        </Label>
      )}
      <Section title="Export encrypted backup">
        <Label muted>
          Includes workspace configuration, bots, conversations and workspace
          files. Choose a password with at least 12 characters and keep it
          somewhere safe.
        </Label>
        <Input
          label="Backup password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!disabled}
        />
        <Input
          label="Confirm backup password"
          value={repeat}
          onChangeText={setRepeat}
          secureTextEntry
          editable={!disabled}
        />
        <Button
          title="Export backup"
          disabled={
            disabled ||
            password.length < 12 ||
            password.length > 1024 ||
            password !== repeat
          }
          onPress={() =>
            void action.run(async () => {
              const result = await client.request<{
                id: string;
                filename: string;
              }>(
                "/api/workspace-backup/export",
                "POST",
                { password, clientState: {} },
                120000,
              );
              setExported(result);
              setPassword("");
              setRepeat("");
              await download(result);
              await load();
            })
          }
        />
        {exported && (
          <Button
            title="Download exported backup again"
            disabled={action.busy}
            onPress={() => void action.run(() => download(exported))}
          />
        )}
      </Section>
      <Section title="Restore backup">
        <Label muted>
          Preview a backup before replacing the connected workspace. Your
          phone's saved connections and local preferences are kept.
        </Label>
        <Button
          title={file?.name ?? "Choose backup file"}
          disabled={disabled}
          onPress={() =>
            void action.run(async () => {
              const picked = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
              });
              if (!picked.canceled) {
                setFile(picked.assets[0]);
                setPreview(undefined);
                setConfirmation("");
              }
            })
          }
        />
        <Input
          label="Password for imported backup"
          secureTextEntry
          value={importPassword}
          onChangeText={setImportPassword}
          editable={!disabled}
        />
        <Button
          title="Preview backup"
          disabled={disabled || !file || !importPassword}
          onPress={() =>
            void action.run(async () => {
              const response = await FileSystem.uploadAsync(
                `${client.connection.endpoint.url}/api/workspace-backup/upload`,
                file!.uri,
                {
                  httpMethod: "POST",
                  uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                  headers: {
                    Authorization: `Bearer ${client.token}`,
                    "Content-Type": "application/octet-stream",
                  },
                },
              );
              const body = JSON.parse(response.body) as {
                id?: string;
                error?: string;
              };
              if (response.status !== 200 && response.status !== 201)
                throw new Error(body.error ?? "Backup upload failed.");
              if (!body.id) throw new Error("Backup upload returned no file.");
              const result = await client.request<{
                id: string;
                summary: WorkspaceBackupSummary;
              }>(
                "/api/workspace-backup/preview",
                "POST",
                { id: body.id, password: importPassword },
                120000,
              );
              setPreview(result);
              setImportPassword("");
              setConfirmation("");
            })
          }
        />
      </Section>
      {preview && (
        <Section title="Backup preview">
          <Label>
            {new Date(preview.summary.createdAt).toLocaleString()} · Version{" "}
            {preview.summary.appVersion}
          </Label>
          <Label>
            {preview.summary.bots} bots · {preview.summary.groups} groups ·{" "}
            {preview.summary.threads} threads · {preview.summary.messages}{" "}
            messages
          </Label>
          <Label>
            {preview.summary.files} files ·{" "}
            {(preview.summary.bytes / 1048576).toFixed(1)} MB
          </Label>
          {preview.summary.warnings.map((warning, i) => (
            <Label key={i}>{warning}</Label>
          ))}
          {!!preview.summary.exclusions.length && (
            <Label muted>
              Excluded: {preview.summary.exclusions.join(", ")}
            </Label>
          )}
          <Label>
            Restoring replaces the connected workspace. Type REPLACE to confirm.
          </Label>
          <Input
            label="Restore confirmation"
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            editable={!disabled}
          />
          <Button
            title="Replace workspace with this backup"
            danger
            disabled={disabled || confirmation !== "REPLACE"}
            onPress={() =>
              void action.run(async () => {
                await client.request(
                  "/api/workspace-backup/restore",
                  "POST",
                  { id: preview.id, confirmation: "REPLACE" },
                  120000,
                );
                setPreview(undefined);
                setConfirmation("");
                await load();
              })
            }
          />
        </Section>
      )}
    </>
  );
}
