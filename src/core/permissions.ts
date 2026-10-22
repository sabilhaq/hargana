import type { PriceObservation, User } from "./types";

// The same rules the server enforces on push, for the app to hide what a user
// may not do. When the user or their role is not known yet (e.g. never signed
// in on this device), nothing is hidden: the server still decides.

const isContributor = (me: User | null) => me?.role === "contributor";

/** Owners may change anything; contributors only what they added. */
export function canEdit(me: User | null, record: { createdBy?: string | null }) {
  return !isContributor(me) || (!!record.createdBy && record.createdBy === me!.id);
}

/** Owners may remove any price; contributors only the ones they recorded. */
export function canRemovePrice(me: User | null, observation: Pick<PriceObservation, "recordedBy">) {
  return !isContributor(me) || (!!observation.recordedBy && observation.recordedBy === me!.id);
}

/** Regions and categories shape everyone's data: only the owner adds or changes them. */
export function canManageSettings(me: User | null) {
  return !isContributor(me);
}
