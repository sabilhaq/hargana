"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent } from "react";
import { PRICING_UNITS, type Category, type Item, type PricingUnit } from "@/core";
import { useCore } from "../../core-provider";
import { Empty, Field, FormActions, FormError, inputClass, Screen, useCoreData, useSave } from "../../ui";

// Add (no `id`) or edit (`?id=`) a commodity. `?name=` and `?category=`
// pre-fill a new one, e.g. from a search with no results.
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

  return (
    <Screen title={id ? t("edit") : t("add")} back="/">
      {item === "missing" && <Empty>{t("notFound")}</Empty>}
      {item !== undefined && item !== "missing" && categories && (
        <CommodityForm
          key={item?.id ?? "new"}
          item={item}
          categories={categories}
          defaultName={params.get("name") ?? ""}
          defaultCategory={params.get("category") ?? ""}
        />
      )}
    </Screen>
  );
}

function CommodityForm({
  item,
  categories,
  defaultName,
  defaultCategory,
}: {
  item: Item | null;
  categories: Category[];
  defaultName: string;
  defaultCategory: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const core = useCore();
  const { saving, error, run } = useSave();
  const leave = () => (history.length > 1 ? router.back() : router.replace("/"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await run(() =>
      core.saveCommodity({
        id: item?.id,
        name: String(form.get("name")),
        pricingUnit: String(form.get("pricingUnit")) as PricingUnit,
        categoryId: String(form.get("categoryId")) || null,
        aliases: String(form.get("aliases")).split(","),
      }),
    );
    if (saved) leave();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t("Items.name")}>
        <input
          name="name"
          required
          autoFocus={!item}
          defaultValue={item?.name ?? defaultName}
          placeholder="Cabai rawit merah"
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Items.pricingUnit")}>
          <select name="pricingUnit" defaultValue={item?.pricingUnit ?? "kg"} className={inputClass}>
            {PRICING_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`Units.${unit}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Items.category")}>
          <select name="categoryId" defaultValue={item?.categoryId ?? defaultCategory} className={inputClass}>
            <option value="">{t("Items.noCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t("Items.aliases")}>
        <input
          name="aliases"
          defaultValue={item?.aliases.join(", ")}
          placeholder="cabe rawit, cengek"
          className={inputClass}
        />
      </Field>
      <p className="-mt-2 text-sm opacity-60">{t("Items.aliasesHint")}</p>
      <FormError error={error} />
      <FormActions saving={saving} onCancel={leave} />
    </form>
  );
}
