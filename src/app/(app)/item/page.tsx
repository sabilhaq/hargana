"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useDescribeItem } from "../items/describe";
import { Empty, Screen, useCoreData } from "../ui";

// The item's page (`?id=`). Prices and the result screen arrive with #6.
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
  const id = useSearchParams().get("id") ?? "";
  const [item] = useCoreData((core) => core.getItem(id).catch(() => null), [id]);
  const [categories] = useCoreData((core) => core.listCategories());
  const category = item && categories?.find((c) => c.id === item.categoryId);

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
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
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
          <Empty>{t("noPricesYet")}</Empty>
          <Link
            href={`/items/edit?id=${item.id}`}
            className="rounded-lg border border-neutral-300 px-4 py-3 text-center font-semibold dark:border-neutral-700"
          >
            {t("edit")}
          </Link>
        </>
      )}
    </Screen>
  );
}
