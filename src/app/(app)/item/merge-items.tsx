"use client";

import { compatibleUnits, type Commodity, type Item } from "@/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useCore } from "../core-provider";
import { useDescribeItem } from "../items/describe";
import { usePermissions } from "../permissions";
import { Button, FormError, inputClass, List, useCoreData, useSave } from "../ui";

/**
 * "Gabungkan dengan barang lain…" for the owner, on a market item: find the
 * duplicate, confirm, and its prices and names move onto this item.
 */
export function MergeItems({ item, onMerged }: { item: Commodity; onMerged: () => void }) {
  const t = useTranslations("Merge");
  const core = useCore();
  const describe = useDescribeItem();
  const { canManageSettings } = usePermissions();
  const { saving, error, run } = useSave();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [duplicate, setDuplicate] = useState<Item | null>(null);
  const [matches] = useCoreData((core) => core.searchItems(query, { limit: 10 }), [query]);
  if (!canManageSettings) return null;

  const units = compatibleUnits(item.pricingUnit);
  const candidates = (matches ?? []).map((m) => m.item).filter((other) => other.id !== item.id);
  const mergeable = (other: Item) => other.kind === "commodity" && units.includes(other.pricingUnit);

  async function merge() {
    if (duplicate && (await run(() => core.mergeItems(item.id, duplicate.id)))) {
      setOpen(false);
      setDuplicate(null);
      setQuery("");
      onMerged();
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        {t("open")}
      </Button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-300 p-4 dark:border-neutral-700">
      <p className="font-semibold">{t("title")}</p>
      {duplicate ? (
        <>
          <p className="text-sm">{t("confirmHint", { duplicate: duplicate.name, keep: item.name })}</p>
          <FormError error={error} />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setDuplicate(null)} className="flex-1">
              {t("back")}
            </Button>
            <Button type="button" onClick={merge} disabled={saving} className="flex-1">
              {t("confirm")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm opacity-70">{t("hint", { keep: item.name })}</p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className={inputClass}
            autoFocus
          />
          {query.trim() && candidates.length === 0 && <p className="text-sm opacity-60">{t("none")}</p>}
          {candidates.length > 0 && (
            <List>
              {candidates.map((other) => (
                <li key={other.id}>
                  <button
                    type="button"
                    disabled={!mergeable(other)}
                    onClick={() => setDuplicate(other)}
                    className="flex w-full flex-col px-4 py-3 text-start disabled:opacity-50"
                  >
                    <span className="font-medium">{other.name}</span>
                    <span className="text-sm opacity-60">
                      {mergeable(other) ? describe(other) : t(other.kind === "product" ? "notProduct" : "otherUnit")}
                    </span>
                  </button>
                </li>
              ))}
            </List>
          )}
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </>
      )}
    </section>
  );
}
