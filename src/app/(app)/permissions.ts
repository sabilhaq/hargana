"use client";

import { canEdit, canManageSettings, canRemovePrice, type PriceObservation } from "@/core";
import { useSync } from "./sync";

/**
 * What the signed-in user may do, for hiding actions they can't use. The
 * server enforces the same rules; until the user is known, nothing is hidden.
 */
export function usePermissions() {
  const { me } = useSync();
  return {
    canEdit: (record: { createdBy?: string | null }) => canEdit(me, record),
    canRemovePrice: (observation: Pick<PriceObservation, "recordedBy">) => canRemovePrice(me, observation),
    canManageSettings: canManageSettings(me),
  };
}
