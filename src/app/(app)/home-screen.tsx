"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ItemMatch } from "@/core";
import { BarcodeSheet } from "./barcode-sheet";
import { useDescribeItem } from "./items/describe";
import { StorePicker } from "./store-picker";
import { Empty, inputClass, List, Row, useCoreData } from "./ui";

export function HomeScreen() {
  const t = useTranslations();
  const [context, reloadContext] = useCoreData((core) => core.context());
  const [picking, setPicking] = useState(false);

  // Coming back to the app counts as activity and re-checks the 4-hour reset.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && reloadContext();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-green-700">{t("App.name")}</h1>
        <Link
          href="/settings"
          className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {t("Settings.title")}
        </Link>
      </header>

      <button
        type="button"
        onClick={() => setPicking(true)}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-full border border-green-700/30 bg-green-50 px-4 py-2 text-start dark:bg-green-950"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-green-800 dark:text-green-300">
            {context?.currentStore
              ? t("StoreChip.at", { name: context.currentStore.name })
              : t("StoreChip.none")}
          </span>
          {context && <span className="truncate text-xs opacity-70">{context.activeRegion.name}</span>}
        </span>
        <span aria-hidden className="text-sm text-green-800 dark:text-green-300">
          ▾
        </span>
      </button>
      <StorePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPicked={() => {
          setPicking(false);
          reloadContext();
        }}
      />

      <Suspense>
        <Catalog />
      </Suspense>
    </main>
  );
}

/**
 * Search bar and category browse. The query (`q`) and category (`c`) live in
 * the URL so coming back from an item restores them.
 */
function Catalog() {
  const t = useTranslations();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const categoryId = params.get("c");
  const [status] = useCoreData((core) => core.status());
  const [categories] = useCoreData((core) => core.listCategories());
  const [results] = useCoreData((core) => core.searchItems(query), [query]);
  const [inCategory] = useCoreData(
    (core) => (categoryId ? core.listItems({ categoryId }) : Promise.resolve([])),
    [categoryId],
  );
  const [typingCode, setTypingCode] = useState(false);
  const searching = query.trim() !== "";
  const category = categories?.find((c) => c.id === categoryId);

  function update(next: { q?: string; c?: string | null }) {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(next)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    history.replaceState(null, "", url);
  }

  function search(text: string) {
    setQuery(text);
    update({ q: text });
  }

  const newItemHref = (name?: string) => {
    const target = new URLSearchParams();
    if (name) target.set("name", name);
    if (categoryId) target.set("category", categoryId);
    return `/items/edit${target.size ? `?${target}` : ""}`;
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <input
        type="search"
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder={t("Home.search")}
        aria-label={t("Home.search")}
        className={inputClass}
      />
      <button
        type="button"
        onClick={() => setTypingCode(true)}
        className="-mt-2 self-start py-1 text-sm font-semibold text-green-700 dark:text-green-500"
      >
        {t("Barcode.typeCode")}
      </button>
      <BarcodeSheet open={typingCode} onClose={() => setTypingCode(false)} />

      {searching ? (
        results?.length === 0 ? (
          <Empty>
            {t("Home.noResults", { query: query.trim() })}{" "}
            <Link href={newItemHref(query.trim())} className="font-semibold text-green-700 dark:text-green-500">
              {t("Home.addNamed", { name: query.trim() })}
            </Link>
          </Empty>
        ) : (
          <ItemList matches={results} />
        )
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("Home.categories")}>
            {categories?.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === categoryId}
                onClick={() => update({ c: c.id === categoryId ? null : c.id })}
                className="rounded-full border border-neutral-300 px-3 py-2 text-sm font-medium aria-pressed:border-green-700 aria-pressed:bg-green-700 aria-pressed:text-white dark:border-neutral-700"
              >
                {c.name}
              </button>
            ))}
          </div>

          {category ? (
            inCategory?.length === 0 ? (
              <Empty>{t("Home.categoryEmpty", { category: category.name })}</Empty>
            ) : (
              <ItemList matches={inCategory} />
            )
          ) : status?.itemCount === 0 ? (
            <section className="mt-8 flex flex-col items-center text-center">
              <h2 className="text-lg font-semibold">{t("Home.emptyTitle")}</h2>
              <p className="mt-2 max-w-xs text-sm opacity-70">{t("Home.emptyBody")}</p>
            </section>
          ) : null}
        </>
      )}

      <Link
        href={newItemHref()}
        className="rounded-lg border border-neutral-300 px-4 py-3 text-center font-semibold dark:border-neutral-700"
      >
        {t("Home.addCommodity")}
      </Link>

      {status && (
        <p className="text-center text-xs opacity-60">
          {t("Home.itemCount", { count: status.itemCount })} · {t("Home.pendingSync", { count: status.pendingSyncCount })}
        </p>
      )}
    </div>
  );
}

function ItemList({ matches }: { matches?: ItemMatch[] }) {
  const describe = useDescribeItem();
  if (!matches) return null;
  return (
    <List>
      {matches.map(({ item, category }) => (
        <Row
          key={item.id}
          href={`/item?id=${item.id}`}
          title={item.name}
          detail={[describe(item), category?.name].filter(Boolean).join(" · ")}
        />
      ))}
    </List>
  );
}
