"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCore } from "../../core-provider";
import { usePermissions } from "../../permissions";
import { Empty, List, Screen, Section, useCoreData } from "../../ui";

type Kind = "item" | "store" | "chain";

/** Items, stores and chains the owner removed, each with "Kembalikan". */
export default function RemovedPage() {
  const t = useTranslations("Remove");
  const core = useCore();
  const format = useFormatter();
  const { canManageSettings } = usePermissions();
  const [removed, reload] = useCoreData((c) => c.listRemoved());

  const restore = (kind: Kind, id: string) => () => void core.restoreRecord(kind, id).then(reload);
  const when = (iso?: string | null) => (iso ? format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" }) : "");
  const row = (kind: Kind, record: { id: string; name: string; removedAt?: string | null }): ReactNode => (
    <li key={record.id} className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{record.name}</span>
        <span className="text-sm opacity-60">{t("removedOn", { date: when(record.removedAt) })}</span>
      </span>
      {canManageSettings && (
        <button type="button" onClick={restore(kind, record.id)} className="shrink-0 text-sm font-semibold text-green-700 dark:text-green-500">
          {t("restore")}
        </button>
      )}
    </li>
  );

  const total = removed ? removed.items.length + removed.stores.length + removed.chains.length : 0;
  return (
    <Screen title={t("title")} back="/settings">
      {removed && total === 0 && <Empty>{t("none")}</Empty>}
      {removed && removed.items.length > 0 && (
        <Section title={t("items")}>
          <List>{removed.items.map((r) => row("item", r))}</List>
        </Section>
      )}
      {removed && removed.stores.length > 0 && (
        <Section title={t("stores")}>
          <List>{removed.stores.map((r) => row("store", r))}</List>
        </Section>
      )}
      {removed && removed.chains.length > 0 && (
        <Section title={t("chains")}>
          <List>{removed.chains.map((r) => row("chain", r))}</List>
        </Section>
      )}
    </Screen>
  );
}
