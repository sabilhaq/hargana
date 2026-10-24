"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useDescribeItem } from "../items/describe";
import { ItemPhoto } from "../items/photo";
import { useCore } from "../core-provider";
import { usePermissions } from "../permissions";
import { RemoveButton } from "../remove-button";
import { Empty, Screen, useCoreData } from "../ui";
import { AddToList } from "./add-to-list";
import { PricePanel } from "./price-panel";

// The result screen for one item (`?id=`): what it is, and its price at every store.
export default function ItemPage() {
  return (
    <Suspense>
      <ItemDetails />
    </Suspense>
  );
}

function ItemDetails() {
  const t = useTranslations("Items");
  const describe = useDescribeItem();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const [item, reloadItem] = useCoreData((core) => core.getItem(id).catch(() => null), [id]);
  const core = useCore();
  const [categories] = useCoreData((core) => core.listCategories());
  const category = item && categories?.find((c) => c.id === item.categoryId);
  const { canEdit, canManageSettings } = usePermissions();

  if (item === null) {
    return (
      <Screen title={t("title")} back="/">
        <Empty>{t("notFound")}</Empty>
      </Screen>
    );
  }

  return (
    <Screen title={item?.name ?? ""} back="/">
      {item && (
        <>
          {item.removedAt && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
              <span>{t("removed")}</span>
              {canManageSettings && (
                <button type="button" onClick={() => void core.restoreRecord("item", item.id).then(reloadItem)} className="shrink-0 font-semibold">
                  {t("restore")}
                </button>
              )}
            </div>
          )}
          <div className="flex items-start gap-4">
            <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="opacity-60">{item.kind === "product" ? t("product") : t("commodity")}</dt>
              <dd>{describe(item)}</dd>
              {category && (
                <>
                  <dt className="opacity-60">{t("category")}</dt>
                  <dd>{category.name}</dd>
                </>
              )}
              {item.kind === "product" && (
                <>
                  <dt className="opacity-60">{t("barcode")}</dt>
                  <dd className="font-mono">{item.barcode}</dd>
                </>
              )}
              {item.aliases.length > 0 && (
                <>
                  <dt className="opacity-60">{t("aliases")}</dt>
                  <dd>{item.aliases.join(", ")}</dd>
                </>
              )}
            </dl>
            <ItemPhoto itemId={item.id} version={item.updatedAt} />
          </div>
          <PricePanel item={item} startChanging={params.get("change") === "1"} />
          <AddToList itemId={item.id} />
          {canEdit(item) && (
            <Link
              href={`/items/edit?id=${item.id}`}
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center font-semibold dark:border-neutral-700"
            >
              {t("edit")}
            </Link>
          )}
          {!item.removedAt && <RemoveButton kind="item" id={item.id} onRemoved={reloadItem} />}
        </>
      )}
    </Screen>
  );
}
