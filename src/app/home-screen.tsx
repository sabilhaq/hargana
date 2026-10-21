"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CoreStatus } from "@/core";
import { authClient } from "@/lib/auth-client";
import { useCore } from "./core-provider";

export function HomeScreen() {
  const t = useTranslations();
  const router = useRouter();
  const core = useCore();
  const { data: session } = authClient.useSession();
  const [status, setStatus] = useState<CoreStatus | null>(null);

  useEffect(() => {
    core.status().then(setStatus);
  }, [core]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-green-700">{t("App.name")}</h1>
        <button
          type="button"
          onClick={signOut}
          className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {t("Home.signOut")}
        </button>
      </header>
      {session && (
        <p className="mt-1 text-sm opacity-70">
          {t("Home.signedInAs", { email: session.user.email })}
        </p>
      )}

      <section className="mt-16 flex flex-col items-center text-center">
        {status === null ? (
          <p className="opacity-70">{t("Home.loading")}</p>
        ) : status.itemCount === 0 ? (
          <>
            <h2 className="text-lg font-semibold">{t("Home.emptyTitle")}</h2>
            <p className="mt-2 max-w-xs text-sm opacity-70">{t("Home.emptyBody")}</p>
          </>
        ) : (
          <h2 className="text-lg font-semibold">{t("Home.itemCount", { count: status.itemCount })}</h2>
        )}
        {status && (
          <p className="mt-6 text-xs opacity-60">
            {t("Home.pendingSync", { count: status.pendingSyncCount })}
          </p>
        )}
      </section>
    </main>
  );
}
