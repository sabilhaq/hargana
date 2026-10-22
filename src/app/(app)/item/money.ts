import type { Region } from "@/core";
import { formatMoney } from "@/lib/money";

/** Formats minor units in the region's currency; a range shows the symbol once ("Rp 28.000–40.000"). */
export function useMoney(region: Region) {
  return (minor: number, max?: number | null) => {
    const low = formatMoney(minor, region.currency, region.locale);
    return max ? `${low}–${formatMoney(max, region.currency, region.locale).replace(/^[^\d]+/, "")}` : low;
  };
}
