import { currencyDigits } from "@/core";

/**
 * Reads a typed amount into integer minor units, or null if it is not one.
 * Accepts "18000", "18.000" and "Rp 18.000" for rupiah; "45.50" or "45,50"
 * for currencies with cents.
 */
export function parseAmount(text: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  if (digits === 0) {
    const value = Number(cleaned.replace(/[.,]/g, ""));
    return value > 0 ? value : null;
  }
  // The last separator followed by 1–2 digits is the decimal point.
  const match = cleaned.match(/^(.*?)(?:[.,](\d{1,2}))?$/)!;
  const whole = Number(match[1].replace(/[.,]/g, "") || "0");
  const fraction = Number((match[2] ?? "").padEnd(digits, "0").slice(0, digits) || "0");
  const value = whole * 10 ** digits + fraction;
  return value > 0 ? value : null;
}

/** "Rp 36.000", "EGP 45.50", in the region's locale. */
export function formatMoney(minor: number, currency: string, locale: string) {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}
