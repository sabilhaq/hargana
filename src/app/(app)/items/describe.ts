"use client";

import { useTranslations } from "next-intl";
import type { Item } from "@/core";

/** One-line description of an item: brand and size for products, pricing unit for commodities. */
export function useDescribeItem() {
  const t = useTranslations();
  return (item: Item) =>
    item.kind === "commodity"
      ? t("Items.perUnit", { unit: t(`Units.${item.pricingUnit}`) })
      : [item.brand, item.sizeValue != null && item.sizeUnit && `${item.sizeValue} ${t(`Units.${item.sizeUnit}`)}`]
          .filter(Boolean)
          .join(" · ") || t("Items.product");
}
