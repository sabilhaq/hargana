"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CoreStatus, Role, User } from "@/core";
import { authClient } from "@/lib/auth-client";
import { httpTransport, SignedOutError } from "@/lib/sync-transport";
import { useCore } from "./core-provider";
import { useCoreData } from "./ui";

type Phase = "idle" | "syncing" | "offline" | "failed" | "signedOut";
type SyncState = {
  phase: Phase;
  status: CoreStatus | null;
  syncNow: () => void;
  /** The signed-in user: from the session when online, else as last known on this device. */
  me: User | null;
};

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
  const { data: session } = authClient.useSession();

  // New prices are stamped with the signed-in user; the core keeps it for offline use.
  const userId = session?.user.id;
  const userName = session?.user.name;
  const role: Role | undefined = session?.user.role === "owner" ? "owner" : session?.user.role ? "contributor" : undefined;
  const sessionUser = useMemo(() => (userId ? { id: userId, name: userName ?? "", role } : null), [userId, userName, role]);
  useEffect(() => {
    if (sessionUser) void core.setCurrentUser(sessionUser);
  }, [core, sessionUser]);
  const [storedUser] = useCoreData((c) => c.currentUser());
  const me = sessionUser ?? storedUser ?? null;

  const [phase, setPhase] = useState<Phase>("idle");
  const [refused, setRefused] = useState(0);
  const closeRefused = useCallback(() => setRefused(0), []);
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const pending = useRef(0);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return setPhase("offline");
    setPhase("syncing");
    try {
      const report = await core.sync(httpTransport);
      setPhase("idle");
      if (report.refused) setRefused(report.refused);
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

  return (
    <SyncContext value={{ phase, status, syncNow, me }}>
      {children}
      {refused > 0 && <RefusedNotice count={refused} onClose={closeRefused} />}
    </SyncContext>
  );
}

/** Changes the server did not accept (only the owner may make them) were undone on this device. */
function RefusedNotice({ count, onClose }: { count: number; onClose: () => void }) {
  const t = useTranslations("Sync");
  useEffect(() => {
    const timer = setTimeout(onClose, 10_000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-950 shadow-lg dark:bg-amber-900 dark:text-amber-50"
    >
      <p className="flex-1">{t("refused", { count })}</p>
      <button type="button" onClick={onClose} aria-label={t("closeNotice")} className="font-semibold">
        ✕
      </button>
    </div>
  );
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
