"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { usePermissions } from "../../permissions";
import { Button, Empty, Field, FormError, inputClass, List, Screen, Section } from "../../ui";

type Invite = { id: string; name: string | null; createdAt: string; expiresAt: string; status: "open" | "used" | "expired" | "cancelled" };

/** The owner invites friends: a one-time link each, valid for 7 days. Needs a connection. */
export default function InvitesPage() {
  const t = useTranslations("Invites");
  const { canManageSettings } = usePermissions();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [created, setCreated] = useState<{ name: string | null; url: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/invites");
      if (!response.ok) throw new Error(String(response.status));
      setInvites(await response.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!canManageSettings) return;
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [canManageSettings, load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    setSaving(true);
    try {
      const response = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error(String(response.status));
      const invite = (await response.json()) as { name: string | null; url: string };
      setCreated(invite);
      form.reset();
      await load();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    await fetch(`/api/invites/${id}`, { method: "DELETE" }).catch(() => setFailed(true));
    await load();
  }

  if (!canManageSettings) {
    return (
      <Screen title={t("title")} back="/settings">
        <Empty>{t("ownerOnly")}</Empty>
      </Screen>
    );
  }

  return (
    <Screen title={t("title")} back="/settings">
      <p className="text-sm opacity-70">{t("intro")}</p>
      <form onSubmit={create} className="flex flex-col gap-3">
        <Field label={t("name")}>
          <input name="name" placeholder="Budi" className={inputClass} />
        </Field>
        <Button type="submit" disabled={saving}>
          {saving ? t("creating") : t("create")}
        </Button>
      </form>
      {created && <CreatedLink invite={created} onDone={() => setCreated(null)} />}
      <FormError error={failed ? t("needsConnection") : null} />
      <Section title={t("listTitle")}>
        {invites?.length === 0 ? <Empty>{t("none")}</Empty> : invites && <InviteList invites={invites} onCancel={cancel} />}
      </Section>
    </Screen>
  );
}

/** The new link, shown once: copy it or share it straight to a chat app. */
function CreatedLink({ invite, onDone }: { invite: { name: string | null; url: string }; onDone: () => void }) {
  const t = useTranslations("Invites");
  const [copied, setCopied] = useState(false);
  const message = t("shareText", { url: invite.url });

  async function copy() {
    await navigator.clipboard.writeText(invite.url);
    setCopied(true);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-green-700/30 bg-green-50 p-4 dark:bg-green-950">
      <p className="font-semibold">{invite.name ? t("createdFor", { name: invite.name }) : t("created")}</p>
      <p className="break-all rounded-lg bg-white px-3 py-2 font-mono text-xs dark:bg-neutral-900">{invite.url}</p>
      <p className="text-sm opacity-70">{t("onceHint")}</p>
      <div className="flex gap-2">
        <Button onClick={copy} className="flex-1">
          {copied ? t("copied") : t("copy")}
        </Button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <Button variant="secondary" onClick={() => navigator.share({ text: message }).catch(() => {})} className="flex-1">
            {t("share")}
          </Button>
        )}
      </div>
      <Button variant="ghost" onClick={onDone}>
        {t("done")}
      </Button>
    </section>
  );
}

function InviteList({ invites, onCancel }: { invites: Invite[]; onCancel: (id: string) => void }) {
  const t = useTranslations("Invites");
  const format = useFormatter();
  const day = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short" });
  return (
    <List>
      {invites.map((invite) => (
        <li key={invite.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{invite.name ?? t("unnamed")}</span>
            <span className="text-sm opacity-60">
              {t(`status_${invite.status}`)}
              {invite.status === "open" && ` · ${t("until", { date: day(invite.expiresAt) })}`}
            </span>
          </div>
          {invite.status === "open" && (
            <button type="button" onClick={() => onCancel(invite.id)} className="text-sm font-semibold text-red-700 dark:text-red-400">
              {t("cancel")}
            </button>
          )}
        </li>
      ))}
    </List>
  );
}
