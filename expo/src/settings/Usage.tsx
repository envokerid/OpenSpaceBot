import React, { useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { Button, ErrorNotice, Label, useTheme } from "../ui";
import { shareResponse } from "../attachments";
import { Form, useResource, type SettingsProps } from "./shared";
import { usageGroupings, usagePeriods, usageRange, type UsageGrouping, type UsagePeriod, type UsageSummary } from "../core/usage";
import { UsageBreakdown, UsageOverview, UsageTabs } from "./UsageStats";

export function UsageSettings(props: SettingsProps) {
  const [group, setGroup] = useState<UsageGrouping>("bot");
  const [period, setPeriod] = useState<UsagePeriod>("month");
  const range = usageRange(period);
  const query = new URLSearchParams({ ...range, groupBy: group }).toString();
  return <>
    <UsageTabs label="Period" value={period} options={usagePeriods} onChange={setPeriod} />
    <Label muted size={12}>{range.from} – {range.to} · UTC</Label>
    <UsagePeriodContent key={query} {...props} query={query} group={group} setGroup={setGroup} />
  </>;
}

// Remount the resource on filter changes: never show a previous period under
// new labels or let a late response replace the currently selected period.
function UsagePeriodContent({ client, config, reload, query, group, setGroup }: SettingsProps & {
  query: string; group: UsageGrouping; setGroup: (group: UsageGrouping) => void;
}) {
  const c = useTheme();
  const { data, load, action } = useResource<UsageSummary>(client, `/api/usage?${query}`);
  return (
    <>
      <ErrorNotice error={action.error} />
      {!data && !action.error && <View accessibilityLabel="Loading usage" style={{ padding: 24, alignItems: "center", gap: 10 }}>
        <ActivityIndicator color={c.text} /><Label muted>Loading usage…</Label>
      </View>}
      {data && <UsageOverview data={data} />}
      <UsageTabs label="Breakdown by" value={group} options={usageGroupings} onChange={setGroup} />
      {data && <UsageBreakdown data={data} group={group} />}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button title={action.busy ? "Refreshing…" : "Refresh usage"} disabled={action.busy} onPress={() => void action.run(load)} style={{ flexGrow: 1 }} />
        <Button title="Export CSV" disabled={action.busy || !data?.groups.length} style={{ flexGrow: 1 }} onPress={() =>
          void action.run(async () => shareResponse(await client.response(`/api/usage.csv?${query}`), "usage.csv"))} />
      </View>
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
