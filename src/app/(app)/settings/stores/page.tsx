"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type { Chain, LatLng, Store, StoreType } from "@/core";
import { useCore } from "../../core-provider";
import { usePermissions } from "../../permissions";
import {
  Button,
  Empty,
  Field,
  FormActions,
  FormError,
  inputClass,
  List,
  locate,
  Row,
  Screen,
  Section,
  Sheet,
  useCoreData,
  useSave,
} from "../../ui";

type Editing = { kind: "chain"; chain?: Chain } | { kind: "store"; store?: Store } | null;

export default function StoresPage() {
  const t = useTranslations("Stores");
  const tType = useTranslations("StoreType");
  const [regions] = useCoreData((c) => c.listRegions());
  const [context] = useCoreData((c) => c.context());
  const [chosenRegion, setChosenRegion] = useState<string>();
  const regionId = chosenRegion ?? context?.activeRegion.id;
  const [chains, reloadChains] = useCoreData((c) => (regionId ? c.listChains(regionId) : Promise.resolve([])), [regionId]);
  const [stores, reloadStores] = useCoreData((c) => (regionId ? c.listStores(regionId) : Promise.resolve([])), [regionId]);
  const { canEdit } = usePermissions();
  const [editing, setEditing] = useState<Editing>(null);
  const chainName = (id: string | null) => chains?.find((c) => c.id === id)?.name;

  function done() {
    setEditing(null);
    reloadChains();
    reloadStores();
  }

  return (
    <Screen title={t("title")} back="/settings">
      <Field label={t("region")}>
        <select className={inputClass} value={regionId ?? ""} onChange={(e) => setChosenRegion(e.target.value)}>
          {regions?.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
      </Field>

      <Section
        title={t("stores")}
        action={
          <Button variant="ghost" className="px-0 py-1 text-sm" onClick={() => setEditing({ kind: "store" })}>
            + {t("addStore")}
          </Button>
        }
      >
        {stores?.length === 0 ? (
          <Empty>{t("noStores")}</Empty>
        ) : (
          <List>
            {stores?.map((store) => (
              <Row
                key={store.id}
                onClick={canEdit(store) ? () => setEditing({ kind: "store", store }) : undefined}
                title={store.name}
                detail={chainName(store.chainId) ?? tType(store.type)}
              />
            ))}
          </List>
        )}
      </Section>

      <Section
        title={t("chains")}
        action={
          <Button variant="ghost" className="px-0 py-1 text-sm" onClick={() => setEditing({ kind: "chain" })}>
            + {t("addChain")}
          </Button>
        }
      >
        {chains?.length === 0 ? (
          <Empty>{t("noChains")}</Empty>
        ) : (
          <List>
            {chains?.map((chain) => (
              <Row key={chain.id} onClick={canEdit(chain) ? () => setEditing({ kind: "chain", chain }) : undefined} title={chain.name} />
            ))}
          </List>
        )}
      </Section>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing?.kind === "chain"
            ? editing.chain
              ? t("editChain")
              : t("addChain")
            : editing?.store
              ? t("editStore")
              : t("addStore")
        }
      >
        {editing?.kind === "chain" && regionId && (
          <ChainForm chain={editing.chain} regionId={regionId} onDone={done} onCancel={() => setEditing(null)} />
        )}
        {editing?.kind === "store" && regionId && chains && (
          <StoreForm store={editing.store} regionId={regionId} chains={chains} onDone={done} onCancel={() => setEditing(null)} />
        )}
      </Sheet>
    </Screen>
  );
}

function ChainForm({ chain, regionId, onDone, onCancel }: { chain?: Chain; regionId: string; onDone: () => void; onCancel: () => void }) {
  const t = useTranslations("Stores");
  const core = useCore();
  const { saving, error, run } = useSave();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    if (await run(() => core.saveChain({ id: chain?.id, regionId: chain?.regionId ?? regionId, name }))) onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t("chainName")}>
        <input name="name" required defaultValue={chain?.name} placeholder="Yomart" className={inputClass} />
      </Field>
      <FormError error={error} />
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  );
}

function StoreForm({
  store,
  regionId,
  chains,
  onDone,
  onCancel,
}: {
  store?: Store;
  regionId: string;
  chains: Chain[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Stores");
  const tType = useTranslations("StoreType");
  const core = useCore();
  const { saving, error, run } = useSave();
  const [type, setType] = useState<StoreType>(store?.type ?? (chains.length ? "branch" : "traditional_market"));
  const [position, setPosition] = useState<LatLng | undefined>(
    store?.lat != null && store.lng != null ? { lat: store.lat, lng: store.lng } : undefined,
  );
  const [locating, setLocating] = useState(false);

  async function useHere() {
    setLocating(true);
    setPosition((await locate()) ?? position);
    setLocating(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const address = String(form.get("address") ?? "").trim();
    const saved = await run(() =>
      core.saveStore({
        id: store?.id,
        regionId: store?.regionId ?? regionId,
        type,
        chainId: type === "branch" ? String(form.get("chainId") || "") || null : null,
        name: String(form.get("name")),
        address: address || undefined,
        lat: position?.lat,
        lng: position?.lng,
      }),
    );
    if (saved) onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="flex gap-2">
        <legend className="mb-1 text-sm font-medium">{t("type")}</legend>
        {(["branch", "traditional_market"] as const).map((option) => (
          <label
            key={option}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-300 px-3 py-3 text-sm font-medium has-checked:border-green-700 has-checked:bg-green-50 dark:border-neutral-700 dark:has-checked:bg-green-950"
          >
            <input type="radio" name="type" value={option} checked={type === option} onChange={() => setType(option)} className="sr-only" />
            {tType(option)}
          </label>
        ))}
      </fieldset>
      {type === "branch" && (
        <Field label={t("chain")}>
          <select name="chainId" required defaultValue={store?.chainId ?? ""} className={inputClass}>
            <option value="" disabled>
              {chains.length ? t("chooseChain") : t("noChains")}
            </option>
            {chains.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={t("name")}>
        <input
          name="name"
          required
          defaultValue={store?.name}
          placeholder={type === "branch" ? "Yomart Garut Kota" : "Pasar Guntur Ciawitali"}
          className={inputClass}
        />
      </Field>
      <Field label={t("address")}>
        <input name="address" defaultValue={store?.address} className={inputClass} />
      </Field>
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("location")}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {position && (
            <span className="opacity-70">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </span>
          )}
          <Button variant="ghost" className="px-0 py-1 text-sm" onClick={useHere} disabled={locating}>
            {locating ? t("locating") : t("useHere")}
          </Button>
          {position && (
            <Button variant="ghost" className="px-0 py-1 text-sm" onClick={() => setPosition(undefined)}>
              {t("clearLocation")}
            </Button>
          )}
        </div>
        <p className="opacity-60">{t("locationHint")}</p>
      </div>
      <FormError error={error} />
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  );
}
