import type { EntryUnit } from "./types";

// Each unit's dimension and size in that dimension's base unit. Bundle units
// (ikat, sisir, papan…) are their own dimension: 3 ikat converts only to ikat.
const UNITS: Record<EntryUnit, { dimension: string; size: number }> = {
  g: { dimension: "mass", size: 1 },
  ons: { dimension: "mass", size: 100 },
  kg: { dimension: "mass", size: 1000 },
  ml: { dimension: "volume", size: 1 },
  l: { dimension: "volume", size: 1000 },
  pcs: { dimension: "pcs", size: 1 },
  butir: { dimension: "butir", size: 1 },
  ikat: { dimension: "ikat", size: 1 },
  bungkus: { dimension: "bungkus", size: 1 },
  sisir: { dimension: "sisir", size: 1 },
  papan: { dimension: "papan", size: 1 },
};

/** Units a price for `target` can be entered in, e.g. kg → g, ons, kg. */
export function compatibleUnits(target: EntryUnit): EntryUnit[] {
  const { dimension } = UNITS[target];
  return (Object.keys(UNITS) as EntryUnit[]).filter((unit) => UNITS[unit].dimension === dimension);
}

/** `qty` `unit` in `target` units, e.g. 5 ons → 0,5 kg; null when they do not convert. */
export function convertQty(qty: number, unit: EntryUnit, target: EntryUnit): number | null {
  const from = UNITS[unit];
  const to = UNITS[target];
  if (from.dimension !== to.dimension) return null;
  return Math.round((qty * from.size * 1000) / to.size) / 1000;
}

/**
 * The price per one `target` unit, in integer minor units, for `amount` paid
 * for `qty` `unit`, rounded half up. Rp 18.000 for 500 g → Rp 36.000 per kg.
 * Quantities may have up to three decimals (0,5 kg); the arithmetic stays in
 * integers.
 */
export function perUnitPrice(amount: number, qty: number, unit: EntryUnit, target: EntryUnit): number | null {
  const from = UNITS[unit];
  const to = UNITS[target];
  if (from.dimension !== to.dimension) return null;
  const qtyThousandths = Math.round(qty * 1000);
  const numerator = amount * to.size * 1000;
  const denominator = qtyThousandths * from.size;
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}
