"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { createCore, type HarganaCore } from "@/core";
import { httpProductMetadata } from "@/lib/product-metadata";

const CoreContext = createContext<HarganaCore | null>(null);

export function CoreProvider({ children }: { children: ReactNode }) {
  const [core] = useState(() => createCore({ metadata: httpProductMetadata }));
  return <CoreContext value={core}>{children}</CoreContext>;
}

export function useCore() {
  const core = use(CoreContext);
  if (!core) throw new Error("useCore must be used within a CoreProvider");
  return core;
}
