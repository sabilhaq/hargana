"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useCore } from "./core-provider";
import { usePermissions } from "./permissions";
import { Button, FormError, useSave } from "./ui";

/**
 * "Hapus …" for the owner, with a confirmation: hides the record for everyone
 * and stops its prices counting; it can be brought back from Settings → Dihapus.
 */
export function RemoveButton({ kind, id, onRemoved }: { kind: "item" | "store" | "chain"; id: string; onRemoved: () => void }) {
  const t = useTranslations("Remove");
  const core = useCore();
  const { canManageSettings } = usePermissions();
  const { saving, error, run } = useSave();
  const [confirming, setConfirming] = useState(false);
  if (!canManageSettings) return null;

  async function remove() {
    if (await run(() => core.removeRecord(kind, id))) onRemoved();
  }

  return confirming ? (
    <div className="flex flex-col gap-3 rounded-xl border border-red-300 p-4 dark:border-red-900">
      <p className="text-sm">{t(`hint_${kind}`)}</p>
      <FormError error={error} />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)} className="flex-1">
          {t("keep")}
        </Button>
        <Button type="button" onClick={remove} disabled={saving} className="flex-1 bg-red-700!">
          {t("confirm")}
        </Button>
      </div>
    </div>
  ) : (
    <Button type="button" variant="ghost" onClick={() => setConfirming(true)} className="text-red-700! dark:text-red-400!">
      {t(`remove_${kind}`)}
    </Button>
  );
}
