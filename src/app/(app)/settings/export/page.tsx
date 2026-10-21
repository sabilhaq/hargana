"use client";

import { strToU8, zipSync } from "fflate";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { download } from "@/lib/download";
import { useCore } from "../../core-provider";
import { Button, Screen, Section } from "../../ui";

/** Download everything on this device, including changes not yet synced. */
export default function ExportPage() {
  const t = useTranslations("Export");
  const core = useCore();
  const [busy, setBusy] = useState(false);
  const day = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  const json = () =>
    run(async () => {
      const data = await core.exportData();
      download(`hargana-${day()}.json`, JSON.stringify(data, null, 2), "application/json");
    });

  const csv = () =>
    run(async () => {
      const files = await core.exportCsv();
      const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
      download(`hargana-${day()}.zip`, zip as Uint8Array<ArrayBuffer>, "application/zip");
    });

  return (
    <Screen title={t("title")} back="/settings">
      <p className="text-sm opacity-70">{t("intro")}</p>
      <Section title={t("csvTitle")}>
        <p className="text-sm opacity-70">{t("csvHint")}</p>
        <Button onClick={csv} disabled={busy}>
          {t("csv")}
        </Button>
      </Section>
      <Section title={t("jsonTitle")}>
        <p className="text-sm opacity-70">{t("jsonHint")}</p>
        <Button variant="secondary" onClick={json} disabled={busy}>
          {t("json")}
        </Button>
      </Section>
    </Screen>
  );
}
