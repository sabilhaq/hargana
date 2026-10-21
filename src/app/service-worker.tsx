"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { APP_ROUTES } from "@/lib/app-routes";

const enabled = () => process.env.NODE_ENV === "production" && "serviceWorker" in navigator;

// Tells the controlling worker which routes and assets to keep for offline use.
// Routes it already holds are skipped, so this is cheap to repeat.
function warm() {
  const assets = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(location.origin));
  navigator.serviceWorker.controller?.postMessage({ type: "warm", routes: APP_ROUTES, assets });
}

// Registers the service worker in production builds.
export function ServiceWorker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled()) return;
    const sw = navigator.serviceWorker;
    sw.register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID}`, { scope: "/" }).catch(() => {});
    sw.addEventListener("controllerchange", warm);
    return () => sw.removeEventListener("controllerchange", warm);
  }, []);

  // Re-warm after each navigation: pages behind login only cache once signed in.
  useEffect(() => {
    if (enabled()) navigator.serviceWorker.ready.then(warm);
  }, [pathname]);

  return null;
}
