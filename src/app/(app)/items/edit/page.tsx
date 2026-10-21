"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  PRICING_UNITS,
  SIZE_UNITS,
  type Category,
  type Commodity,
  type HarganaCore,
  type Item,
  type PricingUnit,
  type Product,
  type SizeUnit,
} from "@/core";
import { compressPhoto, type CompressedPhoto } from "@/lib/photo";
import { useCore } from "../../core-provider";
import { ItemPhoto, useBytesUrl } from "../photo";
import { Empty, Field, FormActions, FormError, inputClass, Screen, useCoreData, useSave } from "../../ui";

// Add or edit an item. `?id=` edits; otherwise `?kind=product&barcode=` adds a
// product (e.g. after an unknown barcode), pre-filled from Open Food Facts when
// online, and anything else adds a commodity, pre-filled from `?name=` and
// `?category=`.
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
  const barcode = params.get("barcode") ?? "";
  const lookUp = !id && kind === "product" && barcode !== "";
  const [suggested] = useCoreData((core) => (lookUp ? suggestion(core, barcode) : Promise.resolve(null)), [lookUp, barcode]);

  return (
    <Screen title={title} back="/">
      {item === "missing" && <Empty>{t("notFound")}</Empty>}
      {suggested === undefined && <Empty>{t("lookingUp")}</Empty>}
      {item !== undefined && item !== "missing" && categories && suggested !== undefined && (
        <ItemForm
          key={item?.id ?? kind}
          kind={kind}
          item={item}
          categories={categories}
          defaults={{
            name: suggested?.name ?? params.get("name") ?? "",
            category: params.get("category") ?? "",
            barcode,
            brand: suggested?.brand,
            sizeValue: suggested?.sizeValue,
            sizeUnit: suggested?.sizeUnit,
            photo: suggested?.photo,
            suggested: !!suggested,
          }}
        />
      )}
    </Screen>
  );
}

type Defaults = {
  name: string;
  category: string;
  barcode: string;
  brand?: string;
  sizeValue?: number;
  sizeUnit?: SizeUnit;
  photo?: CompressedPhoto;
  /** Pre-filled from Open Food Facts. */
  suggested?: boolean;
};

/**
 * Open Food Facts' details for a new barcode, with its image compressed as the
 * photo. Null when offline or unknown there, so the form opens empty.
 */
async function suggestion(core: HarganaCore, barcode: string) {
  const found = await core.suggestProduct(barcode);
  if (!found) return null;
  let photo: CompressedPhoto | undefined;
  if (found.imageUrl) {
    try {
      const response = await fetch(found.imageUrl, { signal: AbortSignal.timeout(6000) });
      if (response.ok) photo = await compressPhoto(await response.blob());
    } catch {
      // No photo then; the rest still helps.
    }
  }
  return { ...found, photo };
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
  defaults: Defaults;
}) {
  const t = useTranslations();
  const router = useRouter();
  const core = useCore();
  const { saving, error, run } = useSave();
  const product = item?.kind === "product" ? item : undefined;
  const commodity = item?.kind === "commodity" ? item : undefined;
  const leave = () => (history.length > 1 ? router.back() : router.replace("/"));
  // A new photo, "remove", or null to keep the current one.
  const [photo, setPhoto] = useState<CompressedPhoto | "remove" | null>(defaults.photo ?? null);
  const [compressing, setCompressing] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const preview = useBytesUrl(photo && photo !== "remove" ? photo.thumb : null);
  const [current] = useCoreData((core) => (item ? core.itemPhoto(item.id) : Promise.resolve(null)), [item?.id]);
  const hasPhoto = photo === "remove" ? false : photo !== null || !!current;

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoFailed(false);
    setCompressing(true);
    try {
      setPhoto(await compressPhoto(file));
    } catch {
      setPhotoFailed(true);
    } finally {
      setCompressing(false);
    }
  }

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
      if (photo === "remove") await core.removeItemPhoto(saved.id);
      else if (photo) await core.setItemPhoto(saved.id, photo);
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
      {defaults.suggested && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
          {t("Items.suggested")}
        </p>
      )}
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
            <input name="brand" defaultValue={product?.brand ?? defaults.brand} placeholder="Indomie" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Items.size")}>
              <input
                name="sizeValue"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                defaultValue={product?.sizeValue ?? defaults.sizeValue}
                placeholder="85"
                className={inputClass}
              />
            </Field>
            <Field label={t("Items.sizeUnit")}>
              {select(
                "sizeUnit",
                product?.sizeUnit ?? defaults.sizeUnit ?? "g",
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
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("Photos.label")}</span>
        <div className="flex items-center gap-3">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element -- a local object URL */
            <img src={preview} alt="" className="size-24 rounded-xl border border-neutral-200 object-cover dark:border-neutral-800" />
          ) : (
            item && photo === null && <ItemPhoto itemId={item.id} />
          )}
          <div className="flex flex-col items-start gap-2">
            <label className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold dark:border-neutral-700">
              {compressing ? t("Photos.processing") : hasPhoto ? t("Photos.change") : t("Photos.take")}
              <input type="file" accept="image/*" onChange={pickPhoto} disabled={compressing} className="sr-only" />
            </label>
            {hasPhoto && (
              <button
                type="button"
                onClick={() => setPhoto(current ? "remove" : null)}
                className="text-sm text-red-700 dark:text-red-400"
              >
                {t("Photos.remove")}
              </button>
            )}
          </div>
        </div>
        {photoFailed && <p className="text-sm text-red-700 dark:text-red-400">{t("Photos.failed")}</p>}
      </div>
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
      <FormActions saving={saving || compressing} onCancel={leave} />
    </form>
  );
}
