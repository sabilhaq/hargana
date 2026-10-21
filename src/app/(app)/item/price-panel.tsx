"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { compatibleUnits, perUnitPrice, type EntryUnit, type Item, type ItemPrices, type Region, type Store } from "@/core";
import { formatMoney, parseAmount } from "@/lib/money";
import { useCore } from "../core-provider";
import { Button, Empty, Field, FormError, inputClass, List, Section, useCoreData, useSave } from "../ui";

/** Every store's price for the item, and the form to record one at the current store. */
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
        <RecordForm key={store.id} item={item} store={store} region={prices.region} unit={prices.unit} onSaved={reload} />
      ) : (
        <p className="rounded-xl bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-800">{t("viewOnly")}</p>
      )}
      <Section title={t("title", { region: prices.region.name })}>
        {prices.prices.length === 0 ? <Empty>{t("none")}</Empty> : <PriceList prices={prices} here={store?.id} />}
      </Section>
    </>
  );
}

function PriceList({ prices: { prices, region, unit }, here }: { prices: ItemPrices; here?: string }) {
  const t = useTranslations();
  const money = (minor: number) => formatMoney(minor, region.currency, region.locale);

  return (
    <List>
      {prices.map(({ store, chain, price, priceMax, note, ageDays, stale }) => (
        <li key={store.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">
              {store.name}
              {store.id === here && (
                <span className="ms-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
                  {t("Prices.here")}
                </span>
              )}
            </span>
            <span className="text-sm opacity-60">
              {chain?.name ?? t(`StoreType.${store.type}`)} · {t("Prices.checked", { days: ageDays })}
            </span>
            {stale && <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("Prices.stale")}</span>}
            {note && <span className="text-sm italic opacity-70">{note}</span>}
          </div>
          <div className="shrink-0 text-end">
            <div className="font-semibold tabular-nums">
              {priceMax ? `${money(price)}–${money(priceMax).replace(/^[^\d]+/, "")}` : money(price)}
            </div>
            <div className="text-xs opacity-60">{t("Items.perUnit", { unit: t(`Units.${unit}`) })}</div>
          </div>
        </li>
      ))}
    </List>
  );
}

function RecordForm({
  item,
  store,
  region,
  unit,
  onSaved,
}: {
  item: Item;
  store: Store;
  region: Region;
  unit: EntryUnit;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const core = useCore();
  const { saving, error, run } = useSave();
  const isMarket = store.type === "traditional_market";
  const [amount, setAmount] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [range, setRange] = useState(false);
  const [qty, setQty] = useState("1");
  const [entryUnit, setEntryUnit] = useState<EntryUnit>(unit);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const minor = parseAmount(amount, region.currency);
  const minorMax = range ? parseAmount(amountMax, region.currency) : null;
  const quantity = Number(qty.replace(",", "."));
  const money = (value: number) => formatMoney(value, region.currency, region.locale);
  const perUnit = minor && quantity > 0 ? perUnitPrice(minor, quantity, entryUnit, unit) : null;
  const perUnitMax = minorMax && quantity > 0 ? perUnitPrice(minorMax, quantity, entryUnit, unit) : null;
  const showsConversion = perUnit !== null && (quantity !== 1 || entryUnit !== unit || perUnitMax !== null);

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
      }),
    );
    if (ok) {
      setAmount("");
      setAmountMax("");
      setNote("");
      setSaved(true);
      onSaved();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-green-700/30 bg-green-50/50 p-4 dark:bg-green-950/40">
      <h2 className="font-semibold">{t("Prices.recordAt", { store: store.name })}</h2>
      <div className="flex items-end gap-2">
        <Field label={range ? t("Prices.from") : t("Prices.amount")}>
          <input
            required
            inputMode={region.currency === "IDR" ? "numeric" : "decimal"}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setSaved(false);
            }}
            placeholder={region.currency === "IDR" ? "18.000" : "45.50"}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
        {range && (
          <Field label={t("Prices.to")}>
            <input
              required
              inputMode={region.currency === "IDR" ? "numeric" : "decimal"}
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Prices.for")}>
          <input
            required
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={`${inputClass} tabular-nums`}
          />
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
      {isMarket && (
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
      )}
      {showsConversion && (
        <p className="text-sm font-medium">
          {t("Prices.equals", {
            price: perUnitMax ? `${money(perUnit)}–${money(perUnitMax)}` : money(perUnit),
            unit: t(`Units.${unit}`),
          })}
        </p>
      )}
      <FormError error={error} />
      {saved && (
        <p role="status" className="text-sm font-medium text-green-700 dark:text-green-400">
          {t("Prices.saved")}
        </p>
      )}
      <Button type="submit" disabled={saving || !minor}>
        {saving ? t("Common.saving") : t("Prices.save")}
      </Button>
    </form>
  );
}
