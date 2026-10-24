"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import type { BrowseEntry, BrowseSort, Region } from "@/core";
import { useCore } from "../core-provider";
import { useMoney } from "../item/money";
import { SmallPhoto } from "../items/photo";
import { Empty, inputClass, List, Screen, Section, useCoreData } from "../ui";

const SORTS: BrowseSort[] = ["name", "price", "recent"];

/** What a store has and what it costs, by category; or every item at its cheapest store. Offline. */
export default function BrowsePage() {
  const t = useTranslations("Browse");
  // undefined: not chosen yet, so start at the "Saya di" store; "" means all stores.
  const [chosen, setChosen] = useState<string>();
  const [sort, setSort] = useState<BrowseSort>("name");
  const [context] = useCoreData((core) => core.context());
  const storeId = chosen ?? context?.currentStore?.id ?? "";
  const [result] = useCoreData((core) => (context ? core.browse({ storeId: storeId || null, sort }) : Promise.resolve(undefined)), [context, storeId, sort]);

  return (
    <Screen title={t("title")} back="/">
      <div className="flex flex-col gap-2">
        <select aria-label={t("store")} value={storeId} onChange={(e) => setChosen(e.target.value)} className={inputClass}>
          <option value="">{t("allStores")}</option>
          {result?.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div role="radiogroup" aria-label={t("sort")} className="flex gap-2">
          {SORTS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sort === s}
              onClick={() => setSort(s)}
              className={`flex-1 rounded-full border px-3 py-1.5 text-sm ${sort === s ? "border-green-700 bg-green-700 font-semibold text-white" : "border-neutral-300 dark:border-neutral-700"}`}
            >
              {t(`sort_${s}`)}
            </button>
          ))}
        </div>
      </div>
      {result?.count === 0 && <Empty>{result.store ? t("emptyStore") : t("empty")}</Empty>}
      {result && result.count > 0 && <p className="text-sm opacity-60">{t("count", { count: result.count })}</p>}
      {result?.groups.map((group) => (
        <Section key={group.category?.id ?? "other"} title={group.category?.name ?? t("other")}>
          <List>
            {group.entries.map((entry) => (
              <EntryRow key={entry.item.id} entry={entry} region={result.region} showStore={!result.store} />
            ))}
          </List>
        </Section>
      ))}
    </Screen>
  );
}

function EntryRow({ entry, region, showStore }: { entry: BrowseEntry; region: Region; showStore: boolean }) {
  const t = useTranslations();
  const core = useCore();
  const money = useMoney(region);
  const [added, setAdded] = useState(false);

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Link href={`/item?id=${entry.item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <SmallPhoto itemId={entry.item.id} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{entry.item.name}</span>
          <span className="truncate text-sm opacity-60">
            {showStore && `${entry.store.name} · `}
            {t("Prices.checked", { days: entry.ageDays })}
          </span>
          {entry.stale && <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("Prices.stale")}</span>}
        </span>
      </Link>
      <span className="shrink-0 text-end">
        <span className="block font-semibold tabular-nums">{money(entry.price, entry.priceMax)}</span>
        <span className="block text-xs opacity-60">
          {entry.promoUntil ? <span className="font-semibold text-red-700 dark:text-red-400">{t("Browse.promo")}</span> : t("Items.perUnit", { unit: t(`Units.${entry.unit}`) })}
        </span>
      </span>
      <button
        type="button"
        onClick={() => void core.addToList(entry.item.id).then(() => setAdded(true))}
        aria-label={t("Browse.addToList", { item: entry.item.name })}
        className="shrink-0 rounded-full border border-neutral-300 px-2.5 py-1 text-sm font-semibold dark:border-neutral-700"
      >
        {added ? "✓" : "+"}
      </button>
    </li>
  );
}
