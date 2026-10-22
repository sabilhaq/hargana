"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useCore } from "./core-provider";
import { useMoney } from "./item/money";
import { useSync } from "./sync";
import { useCoreData, useSave } from "./ui";

/** Items shown at once; the rest are counted. */
const SHOWN = 5;

/**
 * "Perlu dicek di sini": at the current store, prices that are getting old,
 * oldest first, each one tap from "Sama ✓". Keeping them fresh is what makes
 * the price memory trustworthy.
 */
export function StaleHere({ storeId }: { storeId: string }) {
  const t = useTranslations("Stale");
  const core = useCore();
  // Any write (here or on another screen) changes the sync status, so this reloads after recording.
  const { status } = useSync();
  const [version, setVersion] = useState(0);
  const [data] = useCoreData((c) => c.stalePricesHere({ limit: SHOWN }), [storeId, version, status]);
  const { saving, error, run } = useSave();
  const reload = () => setVersion((v) => v + 1);

  if (!data?.region || data.prices.length === 0) return null;
  const more = data.total - data.prices.length;

  return <StaleList data={data} more={more} saving={saving} error={error}
    onConfirm={(itemId) => run(() => core.confirmPrice(itemId)).then((ok) => ok && reload())}
    onDismiss={(itemId) => core.dismissStale(itemId).then(reload)} title={t("title")} />;
}

function StaleList({
  data,
  more,
  saving,
  error,
  onConfirm,
  onDismiss,
  title,
}: {
  data: Awaited<ReturnType<ReturnType<typeof useCore>["stalePricesHere"]>>;
  more: number;
  saving: boolean;
  error: unknown;
  onConfirm: (itemId: string) => void;
  onDismiss: (itemId: string) => void;
  title: string;
}) {
  const t = useTranslations();
  const money = useMoney(data.region!);

  return (
    <section className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm opacity-70">{t("Stale.hint")}</p>
      </div>
      {error ? <p className="text-sm text-red-700 dark:text-red-400">{t("Errors.unknown")}</p> : null}
      <ul className="flex flex-col divide-y divide-amber-200 dark:divide-amber-900">
        {data.prices.map(({ item, price, priceMax, ageDays }) => (
          <li key={item.id} className="flex flex-col gap-2 py-2">
            <div className="flex items-start gap-2">
              <Link href={`/item?id=${item.id}`} className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{item.name}</span>
                <span className="text-sm opacity-70">
                  <span className="tabular-nums">{money(price, priceMax)}</span> · {t("Prices.checked", { days: ageDays })}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                aria-label={t("Stale.dismiss", { item: item.name })}
                className="-me-1 rounded-lg px-2 py-1 text-sm opacity-60 hover:bg-amber-100 dark:hover:bg-amber-900"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onConfirm(item.id)}
                disabled={saving}
                className="flex-1 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white"
              >
                {t("Prices.same")}
              </button>
              <Link
                href={`/item?id=${item.id}&change=1`}
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-center text-sm font-semibold dark:border-neutral-700"
              >
                {t("Stale.change")}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="text-sm opacity-70">{t("Stale.more", { count: more })}</p>}
    </section>
  );
}
