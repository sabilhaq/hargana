"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, FormActions, FormError, inputClass, Sheet } from "../ui";

/** Error codes from the auth server that get their own message. */
const KNOWN = ["INVALID_PASSWORD", "PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG"];

/**
 * "Ubah kata sandi": needs the current password. Other devices are signed out;
 * this one stays signed in. Needs a connection.
 */
export function ChangePassword() {
  const t = useTranslations("Password");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const [currentPassword, newPassword, repeat] = ["current", "new", "repeat"].map((k) => String(form.get(k) ?? ""));
    if (newPassword !== repeat) return setError(t("error_mismatch"));
    if (!navigator.onLine) return setError(t("error_offline"));
    setSaving(true);
    setError(null);
    const { error: failed } = await authClient
      .changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      .catch(() => ({ error: { code: "network" } }));
    setSaving(false);
    if (failed) {
      const code = failed.code ?? "";
      return setError(KNOWN.includes(code) ? t(`error_${code}`) : navigator.onLine ? t("error_unknown") : t("error_offline"));
    }
    setOpen(false);
    setDone(true);
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setDone(false);
          setError(null);
          setOpen(true);
        }}
      >
        {t("open")}
      </Button>
      {done && (
        <p role="status" className="text-sm font-medium text-green-700 dark:text-green-400">
          {t("done")}
        </p>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t("title")}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t("current")}>
            <input name="current" type="password" required autoComplete="current-password" className={inputClass} />
          </Field>
          <Field label={t("new")}>
            <input name="new" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
          </Field>
          <Field label={t("repeat")}>
            <input name="repeat" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
          </Field>
          <p className="-mt-2 text-sm opacity-60">{t("hint")}</p>
          <FormError error={error} />
          <FormActions saving={saving} onCancel={() => setOpen(false)} />
        </form>
      </Sheet>
    </>
  );
}
