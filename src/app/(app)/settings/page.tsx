"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { usePermissions } from "../permissions";
import { ChangePassword } from "./change-password";
import { useCore } from "../core-provider";
import { Button, inputClass, List, Row, Screen, Section, useCoreData } from "../ui";

export default function SettingsPage() {
  const t = useTranslations();
  const router = useRouter();
  const core = useCore();
  const { data: session } = authClient.useSession();
  const { canManageSettings } = usePermissions();
  const [regions] = useCoreData((c) => c.listRegions());
  const [context, reloadContext] = useCoreData((c) => c.context());

  async function switchRegion(regionId: string) {
    await core.setActiveRegion(regionId);
    reloadContext();
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <Screen title={t("Settings.title")} back="/">
      <Section title={t("Settings.activeRegion")}>
        <select
          aria-label={t("Settings.activeRegion")}
          className={inputClass}
          value={context?.activeRegion.id ?? ""}
          onChange={(e) => switchRegion(e.target.value)}
        >
          {regions?.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
        <p className="text-sm opacity-60">{t("Settings.activeRegionHint")}</p>
      </Section>

      <Section title={t("Settings.data")}>
        <List>
          <Row href="/settings/regions" title={t("Regions.title")} detail={t("Settings.regionsHint")} trailing="›" />
          <Row href="/settings/stores" title={t("Stores.title")} detail={t("Settings.storesHint")} trailing="›" />
          <Row href="/settings/categories" title={t("Categories.title")} trailing="›" />
          <Row href="/settings/unknown-barcodes" title={t("UnknownBarcodes.title")} detail={t("Settings.unknownBarcodesHint")} trailing="›" />
          <Row href="/settings/export" title={t("Export.title")} detail={t("Settings.exportHint")} trailing="›" />
          {canManageSettings && <Row href="/settings/invites" title={t("Invites.title")} detail={t("Settings.invitesHint")} trailing="›" />}
        </List>
      </Section>

      <Section title={t("Settings.account")}>
        {session && <p className="text-sm opacity-70">{t("Home.signedInAs", { email: session.user.email })}</p>}
        <ChangePassword />
        <Button variant="secondary" onClick={signOut}>
          {t("Home.signOut")}
        </Button>
      </Section>
    </Screen>
  );
}
