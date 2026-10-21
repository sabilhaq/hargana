"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { createCore, type HarganaCore } from "@/core";

const CoreContext = createContext<HarganaCore | null>(null);

export function CoreProvider({ children }: { children: ReactNode }) {
  const [core] = useState(() => createCore());
  return <CoreContext value={core}>{children}</CoreContext>;
}

export function useCore() {
  const core = use(CoreContext);
  if (!core) throw new Error("useCore must be used within a CoreProvider");
  return core;
}
