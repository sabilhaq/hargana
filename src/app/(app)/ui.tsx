"use client";

// Small shared building blocks for the app screens.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { CoreError, type HarganaCore } from "@/core";
import { useCore } from "./core-provider";

/**
 * Loads data from the core; call `reload()` after a write. `undefined` while
 * loading.
 */
export function useCoreData<T>(load: (core: HarganaCore) => Promise<T>, deps: unknown[] = []) {
  const core = useCore();
  const [data, setData] = useState<T>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    load(core).then((result) => alive && setData(result));
    return () => {
      alive = false;
    };
    // `load` is usually an inline function; `deps` lists what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, version, ...deps]);

  return [data, () => setVersion((v) => v + 1)] as const;
}

export function Screen({ title, back, children }: { title: string; back?: string; children: ReactNode }) {
  const t = useTranslations("Common");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4">
      <header className="flex items-center gap-2">
        {back && (
          <Link
            href={back}
            aria-label={t("back")}
            className="-ms-2 rounded-lg px-2 py-2 text-xl leading-none hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <span className="inline-block rtl:rotate-180">←</span>
          </Link>
        )}
        <h1 className="text-xl font-bold">{title}</h1>
      </header>
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </main>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {children}
    </ul>
  );
}

/** A tappable list row. */
export function Row({
  title,
  detail,
  trailing,
  href,
  onClick,
}: {
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{title}</span>
        {detail && <span className="truncate text-sm opacity-60">{detail}</span>}
      </span>
      {trailing && <span className="shrink-0 text-sm opacity-60">{trailing}</span>}
    </>
  );
  const className =
    "flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-neutral-50 dark:hover:bg-neutral-900";
  return (
    <li>
      {href ? (
        <Link href={href} className={className}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {body}
        </button>
      )}
    </li>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm opacity-70 dark:border-neutral-700">{children}</p>;
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-green-700 text-white",
    secondary: "border border-neutral-300 dark:border-neutral-700",
    ghost: "text-green-700 dark:text-green-500",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg px-4 py-3 text-base font-semibold disabled:opacity-60 ${styles} ${className}`}
    />
  );
}

export const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

/** A modal sheet; its content mounts only while open, so forms start fresh. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useTranslations("Common");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) {
      dialog.showModal();
      // Start in the first field rather than on the close button.
      dialog.querySelector<HTMLElement>("input:not([type=radio]), select, textarea")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="mx-auto mb-0 mt-auto max-h-[90dvh] w-full max-w-md rounded-t-2xl bg-white p-0 text-neutral-900 backdrop:bg-black/40 sm:mb-auto sm:rounded-2xl dark:bg-neutral-950 dark:text-neutral-100"
    >
      {open && (
        <div className="flex flex-col">
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-neutral-200 bg-inherit px-4 py-3 dark:border-neutral-800">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label={t("close")} className="rounded-lg px-3 py-2 text-lg leading-none hover:bg-neutral-100 dark:hover:bg-neutral-800">
              ✕
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/**
 * Runs a core write for a form: tracks submitting state and turns CoreErrors
 * into a translated message.
 */
export function useSave() {
  const t = useTranslations("Errors");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(write: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await write();
      return true;
    } catch (e) {
      setError(e instanceof CoreError ? t(e.code) : t("unknown"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, run };
}

export function FormError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-red-600">
      {error}
    </p>
  ) : null;
}

export function FormActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  const t = useTranslations("Common");
  return (
    <div className="mt-2 flex gap-2">
      <Button variant="secondary" onClick={onCancel} className="flex-1">
        {t("cancel")}
      </Button>
      <Button type="submit" disabled={saving} className="flex-1">
        {saving ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

/** Reads the device location once; null when unavailable or refused. */
export function locate(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
