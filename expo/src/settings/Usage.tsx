import React, { useState } from "react";
import { Alert } from "react-native";
import { Button, Choice, ErrorNotice, Label, Section } from "../ui";
import { shareResponse } from "../attachments";
import { Form, options, useResource, type SettingsProps } from "./shared";
interface UsageRow {
  key: string;
  label: string;
  turns: number;
  input: number;
  output: number;
  cachedInput: number;
  costUsd: number | null;
  billableUsd?: number | null;
}
interface UsageSummary {
  groups: UsageRow[];
  total: UsageRow;
  budget?: { spentUsd: number; monthlyUsd: number; percent: number };
  billing?: { currency: string };
}
const money = (value: number | null | undefined) =>
  typeof value === "number" ? `$${value.toFixed(2)}` : "Not reported";
export function UsageSettings({ client, config, reload }: SettingsProps) {
  const [group, setGroup] = useState("bot");
  const [period, setPeriod] = useState("month");
  const now = new Date();
  const end =
    period === "lastMonth"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
      : now;
  const start =
    period === "days30"
      ? new Date(now.getTime() - 29 * 86400000)
      : new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - (period === "lastMonth" ? 1 : 0),
            1,
          ),
        );
  const query = new URLSearchParams({
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    groupBy: group,
  });
  const { data, load, action } = useResource<UsageSummary>(
    client,
    `/api/usage?${query}`,
  );
  return (
    <>
      <Choice
        label="Period"
        value={period}
        options={[
          { id: "month", label: "This month" },
          { id: "lastMonth", label: "Last month" },
          { id: "days30", label: "Last 30 days" },
        ]}
        onChange={setPeriod}
      />
      <Choice
        label="Group by"
        value={group}
        options={options("bot", "model", "user", "day", "engine")}
        onChange={setGroup}
      />
      <ErrorNotice error={action.error} />
      <Button
        title="Refresh usage"
        disabled={action.busy}
        onPress={() => void action.run(load)}
      />
      {data && (
        <Section title="Total">
          <Label bold>{money(data.total.costUsd)}</Label>
          <Label>
            {data.total.turns} turns ·{" "}
            {(data.total.input + data.total.output).toLocaleString()} tokens
          </Label>
          <Label muted>
            {data.total.cachedInput.toLocaleString()} cached input tokens
          </Label>
          {data.budget && (
            <Label>
              {money(data.budget.spentUsd)} of {money(data.budget.monthlyUsd)}{" "}
              monthly budget ({Math.round(data.budget.percent)}%)
            </Label>
          )}
        </Section>
      )}
      {data?.groups.map((row) => (
        <Section key={row.key} title={row.label}>
          <Label>
            {row.turns} turns · {(row.input + row.output).toLocaleString()}{" "}
            tokens · {money(row.costUsd)}
          </Label>
          {row.billableUsd != null && (
            <Label muted>
              Billable: {data.billing?.currency ?? "USD"}{" "}
              {row.billableUsd.toFixed(2)}
            </Label>
          )}
        </Section>
      ))}
      <Button
        title="Export usage CSV"
        disabled={action.busy}
        onPress={() =>
          void action.run(async () =>
            shareResponse(
              await client.response(`/api/usage.csv?${query}`),
              "usage.csv",
            ),
          )
        }
      />
      {config.edition?.features.includes("budgets") && (
        <Form
          title="Monthly budget"
          fields={[
            {
              key: "monthlyUsd",
              label: "Monthly limit (USD)",
              number: true,
              min: 0,
              max: 1000000,
            },
            {
              key: "warnAtPercent",
              label: "Warn at (%)",
              number: true,
              integer: true,
              min: 1,
              max: 100,
            },
          ]}
          initial={{
            monthlyUsd: String(config.budgets?.monthlyUsd ?? 0),
            warnAtPercent: String(config.budgets?.warnAtPercent ?? 80),
          }}
          onSave={async (v) => {
            await client.request("/api/config", "PATCH", {
              budgets: {
                monthlyUsd: Number(v.monthlyUsd),
                warnAtPercent: Number(v.warnAtPercent),
              },
            });
            await reload();
            await load();
          }}
        />
      )}
      {config.edition?.features.includes("billing") && (
        <>
          <Form
            title="Billing currency"
            fields={[
              { key: "currency", label: "Currency code", required: true },
            ]}
            initial={{ currency: config.billing?.currency ?? "USD" }}
            onSave={async (v) => {
              await client.request("/api/config", "PATCH", {
                billing: { currency: v.currency.toUpperCase() },
              });
              await reload();
            }}
          />
          {Object.entries(config.billing?.prices ?? {}).map(
            ([model, price]) => (
              <React.Fragment key={model}>
                <Form
                  title={`Prices: ${model}`}
                  fields={[
                    {
                      key: "inputPerMillion",
                      label: "Input per million tokens",
                      number: true,
                      min: 0,
                    },
                    {
                      key: "outputPerMillion",
                      label: "Output per million tokens",
                      number: true,
                      min: 0,
                    },
                    {
                      key: "cachedInputPerMillion",
                      label: "Cached input per million tokens",
                      number: true,
                      min: 0,
                    },
                  ]}
                  initial={{
                    inputPerMillion: String(price.inputPerMillion),
                    outputPerMillion: String(price.outputPerMillion),
                    cachedInputPerMillion: String(
                      price.cachedInputPerMillion ?? "",
                    ),
                  }}
                  onSave={async (v) => {
                    await client.request("/api/config", "PATCH", {
                      billing: {
                        prices: {
                          ...config.billing?.prices,
                          [model]: Object.fromEntries(
                            Object.entries(v)
                              .filter(
                                ([k, x]) =>
                                  k !== "cachedInputPerMillion" || x.trim(),
                              )
                              .map(([k, x]) => [k, Number(x)]),
                          ),
                        },
                      },
                    });
                    await reload();
                  }}
                />
                <Button
                  title={`Remove prices for ${model}`}
                  danger
                  disabled={action.busy}
                  onPress={() =>
                    Alert.alert("Remove these model prices?", model, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () =>
                          void action.run(async () => {
                            const prices = { ...config.billing?.prices };
                            delete prices[model];
                            await client.request("/api/config", "PATCH", {
                              billing: { prices },
                            });
                            await reload();
                          }),
                      },
                    ])
                  }
                />
              </React.Fragment>
            ),
          )}
          <Form
            title="Add model prices"
            fields={[
              { key: "model", label: "Model ID", required: true },
              {
                key: "input",
                label: "Input per million tokens",
                number: true,
                min: 0,
                required: true,
              },
              {
                key: "output",
                label: "Output per million tokens",
                number: true,
                min: 0,
                required: true,
              },
            ]}
            initial={{ model: "", input: "", output: "" }}
            onSave={async (v) => {
              await client.request("/api/config", "PATCH", {
                billing: {
                  prices: {
                    ...config.billing?.prices,
                    [v.model.trim()]: {
                      inputPerMillion: Number(v.input),
                      outputPerMillion: Number(v.output),
                    },
                  },
                },
              });
              await reload();
            }}
          />
        </>
      )}
    </>
  );
}
