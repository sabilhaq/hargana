import { describe, expect, it } from "vitest";
import { parseBarcode } from "./barcode";

describe("barcode validation", () => {
  it("accepts valid codes in all four formats, in canonical form", () => {
    expect(parseBarcode("4006381333931")).toEqual({ ok: true, format: "ean_13", barcode: "4006381333931" });
    expect(parseBarcode("73513537")).toEqual({ ok: true, format: "ean_8", barcode: "73513537" });
    expect(parseBarcode("036000291452")).toEqual({ ok: true, format: "upc_a", barcode: "0036000291452" });
    expect(parseBarcode("04252614")).toEqual({ ok: true, format: "upc_e", barcode: "0042100005264" });
  });

  it("rejects a wrong check digit in all four formats", () => {
    for (const code of ["4006381333932", "73513538", "036000291453", "04252615"]) {
      expect(parseBarcode(code)).toEqual({ ok: false, reason: "bad_check_digit" });
    }
  });

  it("gives a UPC-E code, its UPC-A form and its EAN-13 form the same barcode", () => {
    expect(parseBarcode("04252614")).toMatchObject({ barcode: "0042100005264" });
    expect(parseBarcode("042100005264")).toMatchObject({ barcode: "0042100005264" });
    expect(parseBarcode("0042100005264")).toMatchObject({ barcode: "0042100005264" });
  });

  it("ignores spaces and dashes typed by hand", () => {
    expect(parseBarcode(" 4006381-333931 ")).toMatchObject({ ok: true, barcode: "4006381333931" });
  });

  it("rejects codes of the wrong length", () => {
    expect(parseBarcode("12345")).toEqual({ ok: false, reason: "wrong_length" });
  });

  it("rejects QR codes, URLs and other symbologies as not a product", () => {
    expect(parseBarcode("https://example.com", "qr_code")).toEqual({ ok: false, reason: "not_product" });
    expect(parseBarcode("4006381333931", "qr_code")).toEqual({ ok: false, reason: "not_product" });
    expect(parseBarcode("ABC-123", "code_128")).toEqual({ ok: false, reason: "not_product" });
    expect(parseBarcode("https://example.com")).toEqual({ ok: false, reason: "not_product" });
  });
});
