"use client";

import { useFormatter, useTranslations } from "next-intl";
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
import { parseAmount } from "@/lib/money";
import { useCore } from "../core-provider";
import { Button, Empty, Field, FormError, inputClass, List, Section, Sheet, useCoreData, useSave } from "../ui";
import { useMoney } from "./money";
import { PriceHistorySection } from "./price-history";

/** Every store's price for the item, and recording at the current store. */
export function PricePanel({ item, startChanging = false }: { item: Item; startChanging?: boolean }) {
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
      <Summary prices={prices} />
      {store ? (
        <RecordHere key={store.id} item={item} store={store} prices={prices} onSaved={reload} startChanging={startChanging} />
      ) : (
        <p className="rounded-xl bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-800">{t("viewOnly")}</p>
      )}
      <Section title={t("title", { region: prices.region.name })}>
        {prices.rows.length === 0 ? <Empty>{t("none")}</Empty> : <PriceList prices={prices} here={store?.id} onRemoved={reload} />}
      </Section>
      <PriceHistorySection itemId={item.id} version={prices} />
    </>
  );
}

/** Whether to buy here: the cheapest price elsewhere and the recent low. */
function Summary({ prices: { here, cheapestElsewhere: elsewhere, lowest90Days: lowest, region } }: { prices: ItemPrices }) {
  const t = useTranslations("Decision");
  const money = useMoney(region);
  const format = useFormatter();
  if (!elsewhere && !lowest) return null;
  // "Yomart" is ambiguous when standing in another Yomart.
  const place =
    elsewhere && (elsewhere.chainId && elsewhere.chainId === here?.store.chainId ? t("otherBranches", { chain: elsewhere.name }) : elsewhere.name);

  let verdict: { text: string; tone: "good" | "warn" | "plain" } | null = null;
  if (elsewhere && elsewhere.difference !== null) {
    if (elsewhere.difference > 0) {
      verdict = { text: t("cheaperElsewhere", { amount: money(elsewhere.difference), store: place! }), tone: "warn" };
    } else if (elsewhere.difference === 0) {
      verdict = { text: t("sameElsewhere", { store: place! }), tone: "good" };
    } else {
      verdict = { text: t("cheapestHere", { amount: money(-elsewhere.difference), store: place! }), tone: "good" };
    }
  } else if (elsewhere) {
    verdict = { text: t("cheapest", { price: money(elsewhere.price, elsewhere.priceMax), store: place! }), tone: "plain" };
  }
  const tone = {
    good: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
    plain: "bg-neutral-100 dark:bg-neutral-800",
  };

  return (
    <section className="flex flex-col gap-2">
      {verdict && <p className={`rounded-xl px-4 py-3 font-semibold ${tone[verdict.tone]}`}>{verdict.text}</p>}
      {lowest && (
        <p className="text-sm">
          <span className="opacity-60">{t("lowest90")}: </span>
          <span className="font-semibold tabular-nums">{money(lowest.price)}</span>
          <span className="opacity-60">
            {" "}
            · {lowest.store.name} · {format.dateTime(new Date(lowest.observedAt), { day: "numeric", month: "short" })}
            {here && here.price <= lowest.price && ` · ${t("atLowest")}`}
          </span>
        </p>
      )}
    </section>
  );
}

/** The effective price; while a promo runs, also the struck-through regular price and the promo's last day. */
function PriceText({
  price,
  regularPrice,
  priceMax,
  promoUntil,
  region,
  size = "base",
}: {
  price: number;
  regularPrice: number;
  priceMax: number | null;
  promoUntil: string | null;
  region: Region;
  size?: "base" | "large";
}) {
  const t = useTranslations("Prices");
  const money = useMoney(region);
  const format = useFormatter();
  return (
    <>
      <span className={`${size === "large" ? "text-2xl font-bold" : "font-semibold"} tabular-nums`}>{money(price, priceMax)}</span>
      {promoUntil && (
        <span className="block text-xs">
          <s className="opacity-60">{money(regularPrice)}</s>{" "}
          <span className="font-semibold text-red-700 dark:text-red-400">
            {t("promoUntil", { date: format.dateTime(new Date(`${promoUntil}T00:00:00`), { day: "numeric", month: "short" }) })}
          </span>
        </span>
      )}
    </>
  );
}

/**
 * With a known price here: "Sama ✓" (one tap) or "Ubah harga". Without one:
 * the record form straight away.
 */
function RecordHere({
  item,
  store,
  prices,
  onSaved,
  startChanging,
}: {
  item: Item;
  store: Store;
  prices: ItemPrices;
  onSaved: () => void;
  startChanging: boolean;
}) {
  const t = useTranslations();
  const core = useCore();
  const { saving, error, run } = useSave();
  const [changing, setChanging] = useState(startChanging);
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
        <p>
          <PriceText {...here} region={prices.region} size="large" />
          <span className="text-sm opacity-60">{t("Items.perUnit", { unit: t(`Units.${prices.unit}`) })}</span>
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

function PriceList({ prices, here, onRemoved }: { prices: ItemPrices; here?: string; onRemoved: () => void }) {
  const { rows, region, unit } = prices;
  const t = useTranslations();
  const perUnit = t("Items.perUnit", { unit: t(`Units.${unit}`) });
  const [selected, setSelected] = useState<StorePrice | null>(null);

  const priceCell = (p: { price: number; regularPrice: number; priceMax: number | null; promoUntil: string | null }) => (
    <div className="shrink-0 text-end">
      <PriceText {...p} region={region} />
      <div className="text-xs opacity-60">{perUnit}</div>
    </div>
  );

  // Tapping a store's price shows where it came from, and lets me remove it.
  const storeLine = (p: StorePrice, detail: string) => (
    <button
      type="button"
      onClick={() => setSelected(p)}
      aria-haspopup="dialog"
      className="flex w-full items-start justify-between gap-3 text-start"
    >
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
      {priceCell(p)}
    </button>
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
            {priceCell(r)}
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

  return (
    <>
      <List>{rows.map(row)}</List>
      <PriceDetails
        price={selected}
        region={region}
        perUnit={perUnit}
        onClose={() => setSelected(null)}
        onRemoved={() => {
          setSelected(null);
          onRemoved();
        }}
      />
    </>
  );
}

/** Where a store's price came from, with "Hapus harga ini" for one recorded by mistake. */
function PriceDetails({
  price,
  region,
  perUnit,
  onClose,
  onRemoved,
}: {
  price: StorePrice | null;
  region: Region;
  perUnit: string;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("PriceDetails");
  const core = useCore();
  const money = useMoney(region);
  const format = useFormatter();
  const { saving, error, run } = useSave();
  const [confirming, setConfirming] = useState(false);
  const o = price?.observation;

  function close() {
    setConfirming(false);
    onClose();
  }

  async function remove() {
    if (o && (await run(() => core.removePrice(o.id)))) {
      setConfirming(false);
      onRemoved();
    }
  }

  return (
    <Sheet open={!!price} onClose={close} title={price?.store.name ?? ""}>
      {price && o && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="opacity-60">{t("price")}</dt>
            <dd className="font-semibold tabular-nums">
              {money(o.price, o.priceMax)} <span className="font-normal opacity-60">{perUnit}</span>
            </dd>
            {o.promoPrice != null && o.promoUntil && (
              <>
                <dt className="opacity-60">{t("promo")}</dt>
                <dd className="tabular-nums">
                  {money(o.promoPrice)} · {format.dateTime(new Date(`${o.promoUntil}T00:00:00`), { day: "numeric", month: "short" })}
                </dd>
              </>
            )}
            <dt className="opacity-60">{t("entered")}</dt>
            <dd className="tabular-nums">
              {money(o.enteredAmount, o.enteredAmountMax)} / {o.enteredQty} {o.enteredUnit}
            </dd>
            <dt className="opacity-60">{t("recorded")}</dt>
            <dd>
              {format.dateTime(new Date(o.observedAt), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {t(`action_${o.action}`)}
            </dd>
            {o.scope === "chain" && price.chain && (
              <>
                <dt className="opacity-60">{t("appliesTo")}</dt>
                <dd>{t("wholeChain", { chain: price.chain.name })}</dd>
              </>
            )}
            {o.note && (
              <>
                <dt className="opacity-60">{t("note")}</dt>
                <dd className="italic">{o.note}</dd>
              </>
            )}
          </dl>
          <FormError error={error} />
          {confirming ? (
            <div className="flex flex-col gap-3 rounded-xl border border-red-300 p-4 dark:border-red-900">
              <p className="text-sm">
                {o.scope === "chain" && price.chain ? t("removeChainHint", { chain: price.chain.name }) : t("removeHint")}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirming(false)} className="flex-1">
                  {t("keep")}
                </Button>
                <Button onClick={remove} disabled={saving} className="flex-1 bg-red-700!">
                  {t("removeConfirm")}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)} className="text-red-700! dark:text-red-400!">
              {t("remove")}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
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
  const [promo, setPromo] = useState(false);
  const [promoAmount, setPromoAmount] = useState("");
  const [promoUntil, setPromoUntil] = useState("");
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
        promoAmount: promo ? parseAmount(promoAmount, region.currency) : null,
        promoUntil: promo ? promoUntil : null,
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
      {!range && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={promo} onChange={(e) => setPromo(e.target.checked)} className="size-5" />
          {t("Prices.hasPromo")}
        </label>
      )}
      {promo && !range && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Prices.promoPrice")}>
            <input
              required
              inputMode={numeric}
              value={promoAmount}
              onChange={(e) => setPromoAmount(e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field label={t("Prices.promoLastDay")}>
            <input required type="date" value={promoUntil} onChange={(e) => setPromoUntil(e.target.value)} className={inputClass} />
          </Field>
        </div>
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
