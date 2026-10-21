"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent, type ReactNode } from "react";
import {
  PRICING_UNITS,
  SIZE_UNITS,
  type Category,
  type Commodity,
  type Item,
  type PricingUnit,
  type Product,
  type SizeUnit,
} from "@/core";
import { useCore } from "../../core-provider";
import { Empty, Field, FormActions, FormError, inputClass, Screen, useCoreData, useSave } from "../../ui";

// Add or edit an item. `?id=` edits; otherwise `?kind=product&barcode=` adds a
// product (e.g. after an unknown barcode) and anything else adds a commodity,
// pre-filled from `?name=` and `?category=`.
export default function EditItemPage() {
  return (
    <Suspense>
      <EditItem />
    </Suspense>
  );
}

function EditItem() {
  const t = useTranslations("Items");
  const params = useSearchParams();
  const id = params.get("id");
  // null: adding a new item; "missing": the id is not in the catalog.
  const [item] = useCoreData(
    (core) => (id ? core.getItem(id).catch(() => "missing" as const) : Promise.resolve(null)),
    [id],
  );
  const [categories] = useCoreData((core) => core.listCategories());
  const kind = item && item !== "missing" ? item.kind : params.get("kind") === "product" ? "product" : "commodity";
  const title = id ? t("edit") : kind === "product" ? t("addProduct") : t("add");

  return (
    <Screen title={title} back="/">
      {item === "missing" && <Empty>{t("notFound")}</Empty>}
      {item !== undefined && item !== "missing" && categories && (
        <ItemForm
          key={item?.id ?? kind}
          kind={kind}
          item={item}
          categories={categories}
          defaults={{
            name: params.get("name") ?? "",
            category: params.get("category") ?? "",
            barcode: params.get("barcode") ?? "",
          }}
        />
      )}
    </Screen>
  );
}

function ItemForm({
  kind,
  item,
  categories,
  defaults,
}: {
  kind: Item["kind"];
  item: Item | null;
  categories: Category[];
  defaults: { name: string; category: string; barcode: string };
}) {
  const t = useTranslations();
  const router = useRouter();
  const core = useCore();
  const { saving, error, run } = useSave();
  const product = item?.kind === "product" ? item : undefined;
  const commodity = item?.kind === "commodity" ? item : undefined;
  const leave = () => (history.length > 1 ? router.back() : router.replace("/"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const common = {
      id: item?.id,
      name: text("name"),
      categoryId: text("categoryId") || null,
      aliases: text("aliases").split(","),
    };
    let saved: Commodity | Product | undefined;
    const ok = await run(async () => {
      saved =
        kind === "product"
          ? await core.saveProduct({
              ...common,
              barcode: text("barcode"),
              brand: text("brand"),
              sizeValue: text("sizeValue") ? Number(text("sizeValue")) : undefined,
              sizeUnit: text("sizeValue") ? (text("sizeUnit") as SizeUnit) : undefined,
            })
          : await core.saveCommodity({ ...common, pricingUnit: text("pricingUnit") as PricingUnit });
    });
    if (ok && saved) router.replace(`/item?id=${saved.id}`);
  }

  const select = (name: string, value: string, options: ReactNode) => (
    <select name={name} defaultValue={value} className={inputClass}>
      {options}
    </select>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {kind === "product" && (
        <Field label={t("Items.barcode")}>
          <input
            name="barcode"
            required
            inputMode="numeric"
            defaultValue={product?.barcode ?? defaults.barcode}
            className={`${inputClass} font-mono tracking-wider`}
          />
        </Field>
      )}
      <Field label={t("Items.name")}>
        <input
          name="name"
          required
          autoFocus={!item}
          defaultValue={item?.name ?? defaults.name}
          placeholder={kind === "product" ? "Indomie Goreng" : "Cabai rawit merah"}
          className={inputClass}
        />
      </Field>
      {kind === "product" ? (
        <>
          <Field label={t("Items.brand")}>
            <input name="brand" defaultValue={product?.brand} placeholder="Indomie" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Items.size")}>
              <input
                name="sizeValue"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                defaultValue={product?.sizeValue}
                placeholder="85"
                className={inputClass}
              />
            </Field>
            <Field label={t("Items.sizeUnit")}>
              {select(
                "sizeUnit",
                product?.sizeUnit ?? "g",
                SIZE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {t(`Units.${unit}`)}
                  </option>
                )),
              )}
            </Field>
          </div>
        </>
      ) : (
        <Field label={t("Items.pricingUnit")}>
          {select(
            "pricingUnit",
            commodity?.pricingUnit ?? "kg",
            PRICING_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`Units.${unit}`)}
              </option>
            )),
          )}
        </Field>
      )}
      <Field label={t("Items.category")}>
        {select(
          "categoryId",
          item?.categoryId ?? defaults.category,
          <>
            <option value="">{t("Items.noCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </>,
        )}
      </Field>
      <Field label={t("Items.aliases")}>
        <input
          name="aliases"
          defaultValue={item?.aliases.join(", ")}
          placeholder={kind === "product" ? "mi goreng" : "cabe rawit, cengek"}
          className={inputClass}
        />
      </Field>
      <p className="-mt-2 text-sm opacity-60">{t("Items.aliasesHint")}</p>
      <FormError error={error} />
      <FormActions saving={saving} onCancel={leave} />
    </form>
  );
}
