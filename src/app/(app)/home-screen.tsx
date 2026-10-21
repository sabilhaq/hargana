"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StorePicker } from "./store-picker";
import { useCoreData } from "./ui";

export function HomeScreen() {
  const t = useTranslations();
  const [status] = useCoreData((core) => core.status());
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

      <section className="mt-16 flex flex-col items-center text-center">
        {status === undefined ? (
          <p className="opacity-70">{t("Home.loading")}</p>
        ) : status.itemCount === 0 ? (
          <>
            <h2 className="text-lg font-semibold">{t("Home.emptyTitle")}</h2>
            <p className="mt-2 max-w-xs text-sm opacity-70">{t("Home.emptyBody")}</p>
          </>
        ) : (
          <h2 className="text-lg font-semibold">{t("Home.itemCount", { count: status.itemCount })}</h2>
        )}
        {status && (
          <p className="mt-6 text-xs opacity-60">{t("Home.pendingSync", { count: status.pendingSyncCount })}</p>
        )}
      </section>
    </main>
  );
}
