"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CoreStatus } from "@/core";
import { httpTransport, SignedOutError } from "@/lib/sync-transport";
import { useCore } from "./core-provider";

type Phase = "idle" | "syncing" | "offline" | "failed" | "signedOut";
type SyncState = { phase: Phase; status: CoreStatus | null; syncNow: () => void };

/** Wait after a change before pushing, so a burst of edits goes in one sync. */
const AFTER_CHANGE_MS = 2_000;
/** Retry interval while changes are waiting and the last attempt failed. */
const RETRY_MS = 60_000;

const SyncContext = createContext<SyncState | null>(null);

/**
 * Keeps the device in sync: on start, when the connection comes back, when
 * the app returns to the foreground, and shortly after each local change.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const core = useCore();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const pending = useRef(0);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return setPhase("offline");
    setPhase("syncing");
    try {
      await core.sync(httpTransport);
      setPhase("idle");
    } catch (error) {
      if (error instanceof SignedOutError) setPhase("signedOut");
      else setPhase(navigator.onLine ? "failed" : "offline");
    }
  }, [core]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unwatch = core.watchStatus((next) => {
      setStatus(next);
      if (next.pendingSyncCount > pending.current) {
        clearTimeout(timer);
        timer = setTimeout(syncNow, AFTER_CHANGE_MS);
      }
      pending.current = next.pendingSyncCount;
    });
    const onVisible = () => document.visibilityState === "visible" && syncNow();
    const onOffline = () => setPhase("offline");
    window.addEventListener("online", syncNow);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const retry = setInterval(() => {
      if (pending.current > 0 && document.visibilityState === "visible") syncNow();
    }, RETRY_MS);
    timer = setTimeout(syncNow, 0);
    return () => {
      unwatch();
      clearTimeout(timer);
      clearInterval(retry);
      window.removeEventListener("online", syncNow);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [core, syncNow]);

  return <SyncContext value={{ phase, status, syncNow }}>{children}</SyncContext>;
}

export function useSync() {
  const state = use(SyncContext);
  if (!state) throw new Error("useSync must be used within a SyncProvider");
  return state;
}

/** Whether my data is backed up: synced, waiting (and why), or syncing now. */
export function SyncIndicator() {
  const t = useTranslations("Sync");
  const { phase, status, syncNow } = useSync();
  if (!status) return null;
  const pending = status.pendingSyncCount;

  const base = "rounded-full px-3 py-1 text-xs font-medium";
  if (phase === "signedOut") {
    return (
      <Link href="/login" className={`${base} bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100`}>
        {t("signedOut")}
      </Link>
    );
  }
  if (phase === "syncing") {
    return (
      <span role="status" className={`${base} bg-neutral-100 dark:bg-neutral-800`}>
        {t("syncing")}
      </span>
    );
  }
  if (pending === 0) {
    return (
      <span role="status" className={`${base} text-green-800 dark:text-green-300`}>
        {t("synced")}
      </span>
    );
  }
  const label = phase === "offline" ? t("offline", { count: pending }) : t("pending", { count: pending });
  return (
    <button
      type="button"
      onClick={syncNow}
      className={`${base} bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100`}
      aria-label={`${label}. ${t("retry")}`}
    >
      {label}
    </button>
  );
}
