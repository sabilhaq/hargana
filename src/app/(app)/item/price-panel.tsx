"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import {
  compatibleUnits,
  perUnitPrice,
  type EntryUnit,
  type Item,
  type ItemPrices,
  type PriceRow,
  type Region,
  type Store,
  type StorePrice,
} from "@/core";
import { formatMoney, parseAmount } from "@/lib/money";
import { useCore } from "../core-provider";
import { Button, Empty, Field, FormError, inputClass, List, Section, useCoreData, useSave } from "../ui";

/** Every store's price for the item, and recording at the current store. */
export function PricePanel({ item }: { item: Item }) {
  const t = useTranslations("Prices");
  const [data, reload] = useCoreData(
    async (core) => ({ prices: await core.itemPrices(item.id), context: await core.context() }),
    [item.id],
  );
  if (!data) return null;
  const { prices, context } = data;
  const store = context.currentStore;

  return (
    <>
      {store ? (
        <RecordHere key={store.id} item={item} store={store} prices={prices} onSaved={reload} />
      ) : (
        <p className="rounded-xl bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-800">{t("viewOnly")}</p>
      )}
      <Section title={t("title", { region: prices.region.name })}>
        {prices.rows.length === 0 ? <Empty>{t("none")}</Empty> : <PriceList prices={prices} here={store?.id} />}
      </Section>
    </>
  );
}

function useMoney(region: Region) {
  return (minor: number, max?: number | null) => {
    const low = formatMoney(minor, region.currency, region.locale);
    // "Rp 28.000–40.000": the symbol once.
    return max ? `${low}–${formatMoney(max, region.currency, region.locale).replace(/^[^\d]+/, "")}` : low;
  };
}

/**
 * With a known price here: "Sama ✓" (one tap) or "Ubah harga". Without one:
 * the record form straight away.
 */
function RecordHere({ item, store, prices, onSaved }: { item: Item; store: Store; prices: ItemPrices; onSaved: () => void }) {
  const t = useTranslations();
  const core = useCore();
  const money = useMoney(prices.region);
  const { saving, error, run } = useSave();
  const [changing, setChanging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const here = prices.here;

  async function confirm() {
    if (await run(() => core.confirmPrice(item.id))) {
      setConfirmed(true);
      onSaved();
    }
  }

  if (!here || changing) {
    return (
      <RecordForm
        item={item}
        store={store}
        region={prices.region}
        unit={prices.unit}
        onCancel={here ? () => setChanging(false) : undefined}
        onSaved={() => {
          setChanging(false);
          onSaved();
        }}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-green-700/30 bg-green-50/50 p-4 dark:bg-green-950/40">
      <div>
        <p className="text-sm opacity-70">{t("Prices.hereAt", { store: store.name })}</p>
        <p className="text-2xl font-bold tabular-nums">
          {money(here.price, here.priceMax)}
          <span className="ms-1 text-sm font-normal opacity-60">{t("Items.perUnit", { unit: t(`Units.${prices.unit}`) })}</span>
        </p>
        <p className="text-sm opacity-60">
          {here.fromChain && `${t("Prices.chainPrice", { chain: here.chain?.name ?? "" })} · `}
          {t("Prices.checked", { days: here.ageDays })}
        </p>
      </div>
      <FormError error={error} />
      {confirmed && (
        <p role="status" className="text-sm font-medium text-green-700 dark:text-green-400">
          {t("Prices.confirmed")}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={confirm} disabled={saving} className="flex-1">
          {t("Prices.same")}
        </Button>
        <Button variant="secondary" onClick={() => setChanging(true)} className="flex-1">
          {t("Prices.change")}
        </Button>
      </div>
    </section>
  );
}

function PriceList({ prices: { rows, region, unit }, here }: { prices: ItemPrices; here?: string }) {
  const t = useTranslations();
  const money = useMoney(region);
  const perUnit = t("Items.perUnit", { unit: t(`Units.${unit}`) });

  const priceCell = (price: number, priceMax: number | null) => (
    <div className="shrink-0 text-end">
      <div className="font-semibold tabular-nums">{money(price, priceMax)}</div>
      <div className="text-xs opacity-60">{perUnit}</div>
    </div>
  );

  const storeLine = (p: StorePrice, detail: string) => (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">
          {p.store.name}
          {p.store.id === here && (
            <span className="ms-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
              {t("Prices.here")}
            </span>
          )}
        </span>
        <span className="text-sm opacity-60">
          {detail} · {t("Prices.checked", { days: p.ageDays })}
        </span>
        {p.stale && <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("Prices.stale")}</span>}
        {p.note && <span className="text-sm italic opacity-70">{p.note}</span>}
      </div>
      {priceCell(p.price, p.priceMax)}
    </div>
  );

  const row = (r: PriceRow) =>
    r.kind === "store" ? (
      <li key={r.store.id} className="px-4 py-3">
        {storeLine(r, r.chain?.name ?? t(`StoreType.${r.store.type}`))}
      </li>
    ) : (
      <li key={r.chain.id}>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">
                {r.chain.name} <span className="text-sm font-normal opacity-60 group-open:hidden">▸</span>
                <span className="hidden text-sm font-normal opacity-60 group-open:inline">▾</span>
              </span>
              <span className="text-sm opacity-60">
                {t("Prices.branches", { count: r.branches.length })} · {t("Prices.checked", { days: r.ageDays })}
              </span>
              {r.varies && <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("Prices.varies")}</span>}
              {r.stale && <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("Prices.stale")}</span>}
            </div>
            {priceCell(r.price, r.priceMax)}
          </summary>
          <ul className="border-t border-neutral-200 bg-neutral-50 ps-4 dark:border-neutral-800 dark:bg-neutral-900">
            {r.branches.map((b) => (
              <li key={b.store.id} className="py-3 pe-4">
                {storeLine(b, b.fromChain ? t("Prices.chainPrice", { chain: r.chain.name }) : t("Prices.branchPrice"))}
              </li>
            ))}
          </ul>
        </details>
      </li>
    );

  return <List>{rows.map(row)}</List>;
}

function RecordForm({
  item,
  store,
  region,
  unit,
  onSaved,
  onCancel,
}: {
  item: Item;
  store: Store;
  region: Region;
  unit: EntryUnit;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const core = useCore();
  const money = useMoney(region);
  const { saving, error, run } = useSave();
  const isMarket = store.type === "traditional_market";
  const [amount, setAmount] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [range, setRange] = useState(false);
  const [qty, setQty] = useState("1");
  const [entryUnit, setEntryUnit] = useState<EntryUnit>(unit);
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<"branch" | "chain">("branch");
  const [chainName] = useCoreData(
    async (c) => (store.chainId ? (await c.listChains(store.regionId)).find((ch) => ch.id === store.chainId)?.name : undefined),
    [store.id],
  );

  const minor = parseAmount(amount, region.currency);
  const minorMax = range ? parseAmount(amountMax, region.currency) : null;
  const quantity = Number(qty.replace(",", "."));
  const perUnit = minor && quantity > 0 ? perUnitPrice(minor, quantity, entryUnit, unit) : null;
  const perUnitMax = minorMax && quantity > 0 ? perUnitPrice(minorMax, quantity, entryUnit, unit) : null;
  const showsConversion = perUnit !== null && (quantity !== 1 || entryUnit !== unit || perUnitMax !== null);
  const numeric = region.currency === "IDR" ? "numeric" : "decimal";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!minor) return;
    const ok = await run(() =>
      core.recordPrice({
        itemId: item.id,
        amount: minor,
        amountMax: minorMax,
        qty: quantity,
        unit: entryUnit,
        note: isMarket ? note : null,
        scope: isMarket ? undefined : scope,
      }),
    );
    if (ok) onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-green-700/30 bg-green-50/50 p-4 dark:bg-green-950/40">
      <h2 className="font-semibold">{t("Prices.recordAt", { store: store.name })}</h2>
      <div className="flex items-end gap-2">
        <Field label={range ? t("Prices.from") : t("Prices.amount")}>
          <input
            required
            autoFocus={Boolean(onCancel)}
            inputMode={numeric}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={region.currency === "IDR" ? "18.000" : "45.50"}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
        {range && (
          <Field label={t("Prices.to")}>
            <input
              required
              inputMode={numeric}
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Prices.for")}>
          <input required inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputClass} tabular-nums`} />
        </Field>
        <Field label={t("Items.sizeUnit")}>
          <select value={entryUnit} onChange={(e) => setEntryUnit(e.target.value as EntryUnit)} className={inputClass}>
            {compatibleUnits(unit).map((u) => (
              <option key={u} value={u}>
                {t(`Units.${u}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {isMarket ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={range} onChange={(e) => setRange(e.target.checked)} className="size-5" />
            {t("Prices.isRange")}
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("Prices.notePlaceholder")}
            aria-label={t("Prices.note")}
            className={inputClass}
          />
        </>
      ) : (
        <fieldset className="flex gap-2">
          <legend className="sr-only">{t("Prices.scope")}</legend>
          {(["branch", "chain"] as const).map((option) => (
            <label
              key={option}
              className="flex flex-1 items-center justify-center rounded-lg border border-neutral-300 px-3 py-2 text-center text-sm font-medium has-checked:border-green-700 has-checked:bg-green-100 dark:border-neutral-700 dark:has-checked:bg-green-900"
            >
              <input type="radio" name="scope" checked={scope === option} onChange={() => setScope(option)} className="sr-only" />
              {option === "branch" ? t("Prices.thisBranch") : t("Prices.wholeChain", { chain: chainName ?? "" })}
            </label>
          ))}
        </fieldset>
      )}
      {showsConversion && (
        <p className="text-sm font-medium">
          {t("Prices.equals", { price: money(perUnit, perUnitMax), unit: t(`Units.${unit}`) })}
        </p>
      )}
      <FormError error={error} />
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            {t("Common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={saving || !minor} className="flex-1">
          {saving ? t("Common.saving") : t("Prices.save")}
        </Button>
      </div>
    </form>
  );
}
