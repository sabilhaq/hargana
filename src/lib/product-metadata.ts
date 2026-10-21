import type { ProductMetadata } from "@/core";

/** Open Food Facts through the server proxy. Offline it answers nothing at once. */
export const httpProductMetadata: ProductMetadata = {
  async lookup(barcode) {
    if (!navigator.onLine) return null;
    const response = await fetch(`/api/products/${barcode}`, { signal: AbortSignal.timeout(6000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`product lookup answered ${response.status}`);
    return response.json();
  },
};
