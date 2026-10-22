"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";

const fieldClass = "rounded-lg border border-neutral-300 px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900";

/** The error codes the accept endpoint answers with that have their own message. */
const KNOWN_ERRORS = ["invalid_invite", "USER_ALREADY_EXISTS", "PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG", "INVALID_EMAIL"];

/** Sign-up from an invite link: the friend picks their own password and is signed in. */
export function InviteForm() {
  const t = useTranslations();
  // undefined while checking; null when the link no longer works.
  const [invite, setInvite] = useState<{ token: string; name: string | null } | null>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token") ?? "";
    fetch(`/api/invites/check?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((r: { valid: boolean; name?: string | null }) => setInvite(r.valid ? { token, name: r.name ?? null } : null))
      .catch(() => setInvite(null));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: invite!.token, name: form.get("name"), email: form.get("email"), password: form.get("password") }),
    }).catch(() => null);
    if (response?.ok) {
      // A full load so the app starts with the new session.
      location.replace("/");
      return;
    }
    const code = ((await response?.json().catch(() => null)) as { error?: string } | null)?.error;
    setError(code && KNOWN_ERRORS.includes(code) ? code : "unknown");
    setSubmitting(false);
  }

  const header = (
    <div className="mb-4 text-center">
      <h1 className="text-3xl font-bold text-green-700">{t("App.name")}</h1>
      <p className="mt-1 text-sm opacity-70">{t("App.tagline")}</p>
    </div>
  );

  if (invite === undefined) return <p className="text-sm opacity-70">{t("Invite.checking")}</p>;
  if (invite === null) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4 text-center">
        {header}
        <p>{t("Invite.invalid")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      {header}
      <p className="text-sm">{t("Invite.intro")}</p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("Invite.name")}
        <input name="name" required autoComplete="name" defaultValue={invite.name ?? ""} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("Login.email")}
        <input name="email" type="email" required autoComplete="email" className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("Invite.password")}
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={fieldClass} />
        <span className="text-xs font-normal opacity-60">{t("Invite.passwordHint")}</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t(`Invite.error_${error}`)}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {submitting ? t("Login.submitting") : t("Invite.submit")}
      </button>
    </form>
  );
}
