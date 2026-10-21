import { describe, expect, it } from "vitest";
import { formatMoney, parseAmount } from "./money";

describe("typed amounts", () => {
  it("reads rupiah with or without thousands separators", () => {
    expect(parseAmount("18000", "IDR")).toBe(18000);
    expect(parseAmount("18.000", "IDR")).toBe(18000);
    expect(parseAmount("Rp 1.250.000", "IDR")).toBe(1250000);
  });

  it("reads currencies with cents into minor units", () => {
    expect(parseAmount("45.50", "EGP")).toBe(4550);
    expect(parseAmount("45,5", "EGP")).toBe(4550);
    expect(parseAmount("1,234.75", "EGP")).toBe(123475);
    expect(parseAmount("45", "EGP")).toBe(4500);
  });

  it("rejects empty and zero amounts", () => {
    expect(parseAmount("", "IDR")).toBeNull();
    expect(parseAmount("0", "IDR")).toBeNull();
  });

  it("formats in the region's currency", () => {
    expect(formatMoney(36000, "IDR", "id-ID").replace(/\s/g, " ")).toBe("Rp 36.000");
  });
});
