// Prices are integers in a currency's smallest practical unit. That is not
// always ISO 4217's minor unit: rupiah have no cents in practice.
const PRACTICAL_DIGITS: Record<string, number> = { IDR: 0 };

/** Decimal digits in a currency's practical minor unit (IDR 0, EGP 2). */
export function currencyDigits(currency: string): number {
  if (currency in PRACTICAL_DIGITS) return PRACTICAL_DIGITS[currency];
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
