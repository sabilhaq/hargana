"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import type { ShoppingEntry, ShoppingPlan, StoreTotal } from "@/core";
import { useCore } from "../core-provider";
import { useMoney } from "../item/money";
import { Button, Empty, inputClass, List, Screen, Section, useCoreData } from "../ui";

/** The shopping list, and where it costs least. Kept on this device; works offline. */
export default function ShoppingListPage() {
  const t = useTranslations("ShoppingList");
  const core = useCore();
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  const [list] = useCoreData((c) => c.listShopping(), [version]);
  const [plan] = useCoreData((c) => c.planShopping(), [version]);

  const act = (action: (c: typeof core) => Promise<unknown>) => () => void action(core).then(reload);
  const ticked = list?.some((e) => e.checked);

  return (
    <Screen title={t("title")} back="/">
      <AddItems onAdded={reload} />
      {list?.length === 0 && <Empty>{t("empty")}</Empty>}
      {list && list.length > 0 && (
        <Section title={t("items")} action={ticked ? <Button variant="ghost" className="px-0 py-1 text-sm" onClick={act((c) => c.clearTicked())}>{t("clearTicked")}</Button> : undefined}>
          <List>
            {list.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onChange={reload} />
            ))}
          </List>
        </Section>
      )}
      {plan && plan.count > 0 && <Plan plan={plan} />}
    </Screen>
  );
}

function AddItems({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations("ShoppingList");
  const core = useCore();
  const [query, setQuery] = useState("");
  const [results] = useCoreData((c) => c.searchItems(query, { limit: 6 }), [query]);

  async function add(itemId: string) {
    await core.addToList(itemId);
    setQuery("");
    onAdded();
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
        className={inputClass}
      />
      {query.trim() && results && (
        <List>
          {results.length === 0 && <li className="px-4 py-3 text-sm opacity-60">{t("noResults")}</li>}
          {results.map(({ item }) => (
            <li key={item.id}>
              <button type="button" onClick={() => add(item.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-sm font-semibold text-green-700 dark:text-green-500">+ {t("add")}</span>
              </button>
            </li>
          ))}
        </List>
      )}
    </div>
  );
}

function EntryRow({ entry, onChange }: { entry: ShoppingEntry; onChange: () => void }) {
  const t = useTranslations();
  const core = useCore();
  const [qty, setQty] = useState(String(entry.qty));

  async function saveQty() {
    const value = Number(qty.replace(",", "."));
    if (value > 0 && value !== entry.qty) await core.setListQty(entry.id, value);
    else setQty(String(entry.qty));
    onChange();
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <input
        type="checkbox"
        checked={entry.checked}
        onChange={(e) => void core.tickListEntry(entry.id, e.target.checked).then(onChange)}
        aria-label={t("ShoppingList.tick", { item: entry.item.name })}
        className="size-5 shrink-0"
      />
      <Link href={`/item?id=${entry.item.id}`} className={`min-w-0 flex-1 truncate ${entry.checked ? "line-through opacity-50" : ""}`}>
        {entry.item.name}
      </Link>
      <input
        inputMode="decimal"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onBlur={saveQty}
        aria-label={t("ShoppingList.qty", { item: entry.item.name })}
        className="w-12 rounded-lg border border-neutral-300 px-1.5 py-1 text-end tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
      />
      <span className="w-10 shrink-0 text-sm opacity-60">{t(`Units.${entry.unit}`)}</span>
      <button
        type="button"
        onClick={() => void core.removeFromList(entry.id).then(onChange)}
        aria-label={t("ShoppingList.remove", { item: entry.item.name })}
        className="px-1 text-sm opacity-60"
      >
        ✕
      </button>
    </li>
  );
}

/** Where to buy it: the best single store, every other store, and the split across cheapest stores. */
function Plan({ plan }: { plan: ShoppingPlan }) {
  const t = useTranslations("ShoppingList");
  const money = useMoney(plan.region);
  const [best, ...others] = plan.stores;
  const storeName = (s: StoreTotal) => s.store.name;

  if (!best) {
    return (
      <Section title={t("whereTitle")}>
        <Empty>{t("noPrices")}</Empty>
      </Section>
    );
  }

  return (
    <>
      <Section title={t("whereTitle")}>
        <div className="flex flex-col gap-1 rounded-xl border border-green-700/30 bg-green-50 p-4 dark:bg-green-950">
          <p className="text-sm opacity-70">{t("best")}</p>
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{storeName(best)}</span>
            <span className="text-xl font-bold tabular-nums">{money(best.total)}</span>
          </p>
          <p className="text-sm opacity-70">{t("covered", { covered: best.costs.length, count: plan.count })}</p>
          {best.missing.length > 0 && <p className="text-sm">{t("missingThere", { items: best.missing.map((i) => i.name).join(", ") })}</p>}
          {best.costs.some((c) => c.stale) && <p className="text-sm text-amber-700 dark:text-amber-400">{t("someStale")}</p>}
        </div>
        {others.length > 0 && (
          <List>
            {others.map((s) => (
              <li key={s.store.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{storeName(s)}</span>
                  <span className="text-sm opacity-60">{t("covered", { covered: s.costs.length, count: plan.count })}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(s.total)}</span>
              </li>
            ))}
          </List>
        )}
      </Section>

      {plan.split.stores.length > 1 && (
        <Section title={t("splitTitle")}>
          {plan.split.saving > 0 && <p className="font-semibold text-green-700 dark:text-green-400">{t("saving", { amount: money(plan.split.saving), store: storeName(best) })}</p>}
          <List>
            {plan.split.stores.map((s) => (
              <li key={s.store.id} className="flex flex-col gap-1 px-4 py-3">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{storeName(s)}</span>
                  <span className="font-semibold tabular-nums">{money(s.total)}</span>
                </span>
                <span className="text-sm opacity-70">{s.costs.map((c) => c.item.name).join(", ")}</span>
              </li>
            ))}
          </List>
          <p className="text-sm opacity-70">{t("splitTotal", { total: money(plan.split.total) })}</p>
        </Section>
      )}

      {plan.unpriced.length > 0 && <p className="text-sm opacity-70">{t("unpriced", { items: plan.unpriced.map((i) => i.name).join(", ") })}</p>}
    </>
  );
}
