"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { BarcodeLookup } from "@/core";
import { useCore } from "./core-provider";
import { Button, Field, FormError, inputClass, Sheet } from "./ui";

/**
 * Looks up a typed barcode. A known product opens its page; an unknown one
 * offers to add it.
 */
export function BarcodeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("Barcode");
  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      <ManualEntry />
    </Sheet>
  );
}

function ManualEntry() {
  const t = useTranslations("Barcode");
  const core = useCore();
  const router = useRouter();
  const [result, setResult] = useState<BarcodeLookup | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lookup = await core.lookupBarcode(String(new FormData(event.currentTarget).get("code")));
    if (lookup.status === "found") router.push(`/item?id=${lookup.item.id}`);
    else setResult(lookup);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t("code")}>
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="off"
            placeholder="8991234567890"
            onChange={() => setResult(null)}
            className={`${inputClass} font-mono tracking-wider`}
          />
        </Field>
        {result?.status === "invalid" && <FormError error={t(`invalid_${result.reason}`)} />}
        <Button type="submit">{t("lookUp")}</Button>
      </form>
      {result?.status === "unknown" && <NotFound barcode={result.barcode} />}
    </div>
  );
}

/** "Belum ada di database" with a shortcut to add the product. */
export function NotFound({ barcode }: { barcode: string }) {
  const t = useTranslations("Barcode");
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-neutral-300 px-4 py-5 text-center dark:border-neutral-700">
      <p className="font-semibold">{t("notFound")}</p>
      <p className="font-mono text-sm opacity-70">{barcode}</p>
      <Link
        href={`/items/edit?kind=product&barcode=${barcode}`}
        className="mt-2 rounded-lg bg-green-700 px-4 py-2 font-semibold text-white"
      >
        {t("add")}
      </Link>
    </div>
  );
}
