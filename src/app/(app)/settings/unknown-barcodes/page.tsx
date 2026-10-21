"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Empty, List, Row, Screen, useCoreData } from "../../ui";

/** Barcodes I scanned that are still not in the catalog, to add later. */
export default function UnknownBarcodesPage() {
  const t = useTranslations("UnknownBarcodes");
  const format = useFormatter();
  const [barcodes] = useCoreData((core) => core.listUnknownBarcodes());

  return (
    <Screen title={t("title")} back="/settings">
      {barcodes?.length === 0 && <Empty>{t("empty")}</Empty>}
      {barcodes && barcodes.length > 0 && (
        <List>
          {barcodes.map(({ barcode, count, lastScannedAt }) => (
            <Row
              key={barcode}
              href={`/items/edit?kind=product&barcode=${barcode}`}
              title={<span className="font-mono">{barcode}</span>}
              detail={`${t("scans", { count })} · ${format.dateTime(new Date(lastScannedAt), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
              trailing={t("add")}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}
