"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<"failed" | "error" | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      rememberMe: true,
    });
    if (result.error) {
      setError(result.error.status === 401 ? "failed" : "error");
      setSubmitting(false);
      return;
    }
    router.replace("/");
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="mb-4 text-center">
        <h1 className="text-3xl font-bold text-green-700">{t("App.name")}</h1>
        <p className="mt-1 text-sm opacity-70">{t("App.tagline")}</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("Login.email")}
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-neutral-300 px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("Login.password")}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-neutral-300 px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error === "failed" ? t("Login.failed") : t("Login.error")}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {submitting ? t("Login.submitting") : t("Login.submit")}
      </button>
    </form>
  );
}
