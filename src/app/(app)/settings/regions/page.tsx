"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type { Region } from "@/core";
import { useCore } from "../../core-provider";
import { usePermissions } from "../../permissions";
import { Button, Field, FormActions, FormError, inputClass, List, Row, Screen, Sheet, useCoreData, useSave } from "../../ui";

type Editing = Region | "new" | null;

export default function RegionsPage() {
  const t = useTranslations("Regions");
  const [regions, reload] = useCoreData((c) => c.listRegions());
  const [editing, setEditing] = useState<Editing>(null);
  const { canManageSettings } = usePermissions();
  const tp = useTranslations("Permissions");

  return (
    <Screen title={t("title")} back="/settings">
      <List>
        {regions?.map((region) => (
          <Row
            key={region.id}
            onClick={canManageSettings ? () => setEditing(region) : undefined}
            title={region.name}
            detail={t("summary", {
              currency: region.currency,
              market: region.staleDaysMarket,
              supermarket: region.staleDaysSupermarket,
            })}
          />
        ))}
      </List>
      {canManageSettings ? (
        <Button variant="secondary" onClick={() => setEditing("new")}>
          {t("add")}
        </Button>
      ) : (
        <p className="text-sm opacity-60">{tp("settingsOwnerOnly")}</p>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("add") : t("edit")}>
        {editing && (
          <RegionForm
            region={editing === "new" ? undefined : editing}
            onDone={() => {
              setEditing(null);
              reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Sheet>
    </Screen>
  );
}

function RegionForm({ region, onDone, onCancel }: { region?: Region; onDone: () => void; onCancel: () => void }) {
  const t = useTranslations("Regions");
  const core = useCore();
  const { saving, error, run } = useSave();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const saved = await run(() =>
      core.saveRegion({
        id: region?.id,
        name: text("name"),
        countryCode: text("countryCode"),
        currency: text("currency"),
        locale: text("locale"),
        staleDaysMarket: Number(text("staleDaysMarket")),
        staleDaysSupermarket: Number(text("staleDaysSupermarket")),
      }),
    );
    if (saved) onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t("name")}>
        <input name="name" required defaultValue={region?.name} placeholder="Kabupaten Garut" className={inputClass} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t("countryCode")}>
          <input name="countryCode" required maxLength={2} defaultValue={region?.countryCode} placeholder="ID" className={inputClass} />
        </Field>
        <Field label={t("currency")}>
          <input name="currency" required maxLength={3} defaultValue={region?.currency} placeholder="IDR" className={inputClass} />
        </Field>
        <Field label={t("locale")}>
          <input name="locale" required defaultValue={region?.locale} placeholder="id-ID" className={inputClass} />
        </Field>
      </div>
      <Field label={t("staleMarket")}>
        <input name="staleDaysMarket" type="number" min={1} required defaultValue={region?.staleDaysMarket ?? 7} className={inputClass} />
      </Field>
      <Field label={t("staleSupermarket")}>
        <input name="staleDaysSupermarket" type="number" min={1} required defaultValue={region?.staleDaysSupermarket ?? 30} className={inputClass} />
      </Field>
      <FormError error={error} />
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  );
}
