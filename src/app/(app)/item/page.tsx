"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useDescribeItem } from "../items/describe";
import { ItemPhoto } from "../items/photo";
import { usePermissions } from "../permissions";
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
  const [item] = useCoreData((core) => core.getItem(id).catch(() => null), [id]);
  const [categories] = useCoreData((core) => core.listCategories());
  const category = item && categories?.find((c) => c.id === item.categoryId);
  const { canEdit } = usePermissions();

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
        </>
      )}
    </Screen>
  );
}
