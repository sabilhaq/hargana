import type { BarcodeFormat } from "./types";

export type ParsedBarcode =
  | { ok: true; format: BarcodeFormat; barcode: string }
  | { ok: false; reason: "not_product" | "wrong_length" | "bad_check_digit" };

const PRODUCT_SYMBOLOGIES = new Set<string>(["ean_13", "ean_8", "upc_a", "upc_e"]);

/**
 * Validates an EAN-13, EAN-8, UPC-A or UPC-E code and returns its canonical
 * form, so the same product matches however it was read: UPC-A and UPC-E
 * become the 13-digit GTIN, EAN-8 stays 8 digits.
 *
 * `scannedAs` is the symbology a camera reported; anything that is not a
 * product barcode (QR, Code 128, a URL…) is rejected as `not_product`.
 */
export function parseBarcode(raw: string, scannedAs?: string): ParsedBarcode {
  if (scannedAs && !PRODUCT_SYMBOLOGIES.has(scannedAs)) return { ok: false, reason: "not_product" };
  const code = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(code)) return { ok: false, reason: "not_product" };

  switch (code.length) {
    case 13:
      return checked(code, "ean_13", code);
    case 12:
      return checked(code, "upc_a", `0${code}`);
    case 8: {
      // Eight digits are EAN-8, or UPC-E when they start with 0/1 and only
      // the UPC-E check digit fits (or the camera said it was UPC-E).
      const ean8 = hasValidCheckDigit(code);
      const upcA = /^[01]/.test(code) ? expandUpcE(code) : null;
      const upcE = upcA !== null && hasValidCheckDigit(upcA);
      if (upcE && (scannedAs === "upc_e" || !ean8)) return { ok: true, format: "upc_e", barcode: `0${upcA}` };
      return ean8 ? { ok: true, format: "ean_8", barcode: code } : { ok: false, reason: "bad_check_digit" };
    }
    default:
      return { ok: false, reason: "wrong_length" };
  }
}

function checked(code: string, format: BarcodeFormat, barcode: string): ParsedBarcode {
  return hasValidCheckDigit(code) ? { ok: true, format, barcode } : { ok: false, reason: "bad_check_digit" };
}

/** GS1 check digit: weights 3, 1, 3, 1… from the right, excluding the check digit. */
function hasValidCheckDigit(code: string) {
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, i) => total + digit * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-E (number system, six digits, check digit) → the 12-digit UPC-A it stands for. */
function expandUpcE(code: string) {
  const [ns, x1, x2, x3, x4, x5, x6, check] = [...code];
  let body: string;
  if (x6 <= "2") body = `${x1}${x2}${x6}0000${x3}${x4}${x5}`;
  else if (x6 === "3") body = `${x1}${x2}${x3}00000${x4}${x5}`;
  else if (x6 === "4") body = `${x1}${x2}${x3}${x4}00000${x5}`;
  else body = `${x1}${x2}${x3}${x4}${x5}0000${x6}`;
  return `${ns}${body}${check}`;
}
