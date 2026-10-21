"use client";

import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import type { LatLng } from "@/core";
import { useCore } from "./core-provider";
import { Button, Empty, inputClass, List, locate, Row, Sheet, useCoreData } from "./ui";

/** Searchable store picker for "Saya di"; nearby stores first once location is shared. */
export function StorePicker({
  open,
  onClose,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: () => void;
}) {
  const t = useTranslations("StorePicker");
  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      <PickerBody onPicked={onPicked} />
    </Sheet>
  );
}

function PickerBody({ onPicked }: { onPicked: () => void }) {
  const t = useTranslations();
  const format = useFormatter();
  const core = useCore();
  const [query, setQuery] = useState("");
  const [near, setNear] = useState<LatLng>();
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [matches] = useCoreData((c) => c.searchStores(query, near), [query, near]);
  const [hasStores] = useCoreData((c) => c.listStores().then((s) => s.length > 0));

  async function useLocation() {
    setLocating("busy");
    const position = await locate();
    setNear(position ?? undefined);
    setLocating(position ? "idle" : "denied");
  }

  async function pick(storeId: string | null) {
    await core.setCurrentStore(storeId);
    onPicked();
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("StorePicker.search")}
        aria-label={t("StorePicker.search")}
        className={inputClass}
      />
      {!near && (
        <Button variant="ghost" onClick={useLocation} disabled={locating === "busy"} className="self-start px-0 py-1 text-sm">
          {locating === "busy" ? t("StorePicker.locating") : t("StorePicker.useLocation")}
        </Button>
      )}
      {locating === "denied" && <p className="text-sm opacity-70">{t("StorePicker.locationDenied")}</p>}

      {hasStores === false ? (
        <Empty>{t("StorePicker.empty")}</Empty>
      ) : matches?.length === 0 ? (
        <Empty>{t("StorePicker.noMatch")}</Empty>
      ) : (
        <List>
          {matches?.map(({ store, chain, region, distanceKm, nearby }) => (
            <Row
              key={store.id}
              onClick={() => pick(store.id)}
              title={store.name}
              detail={[chain?.name ?? t(`StoreType.${store.type}`), region.name].join(" · ")}
              trailing={
                distanceKm != null
                  ? (nearby ? `${t("StorePicker.nearby")} · ` : "") +
                    t("StorePicker.distance", { km: format.number(distanceKm, { maximumFractionDigits: 1 }) })
                  : undefined
              }
            />
          ))}
        </List>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => pick(null)} className="px-0 text-sm">
          {t("StorePicker.notInStore")}
        </Button>
        <Link href="/settings/stores" className="text-sm font-semibold text-green-700 dark:text-green-500">
          {t("StorePicker.manage")}
        </Link>
      </div>
    </div>
  );
}
