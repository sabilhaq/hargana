import type { ProductSuggestion, SizeUnit } from "@/core";

// Open Food Facts, reached only from the server: one place for the user agent
// their API asks for, a timeout, and turning their product into a suggestion.

const API = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS = "product_name_id,product_name,product_name_en,brands,quantity,image_front_url,image_url";
const USER_AGENT = "Hargana/0.1 (personal price memory; https://github.com/sabilhaq/hargana)";
const IMAGE_HOST = "https://images.openfoodfacts.org/";

type OffProduct = {
  product_name_id?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
  image_url?: string;
};

export type OpenFoodFacts = ReturnType<typeof openFoodFacts>;

export function openFoodFacts({ fetch: get = fetch, timeoutMs = 4000 }: { fetch?: typeof fetch; timeoutMs?: number } = {}) {
  const request = (url: string) => get(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });

  async function product(barcode: string): Promise<OffProduct | null> {
    const response = await request(`${API}/${barcode}.json?fields=${FIELDS}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { status?: number; product?: OffProduct };
    return body.status === 1 && body.product ? body.product : null;
  }

  return {
    /** The product as a form suggestion, or null when Open Food Facts has no usable name. */
    async lookup(barcode: string): Promise<ProductSuggestion | null> {
      const found = await product(barcode);
      const name = [found?.product_name_id, found?.product_name, found?.product_name_en].find((n) => n?.trim())?.trim();
      if (!found || !name) return null;
      const brand = found.brands?.split(",")[0].trim();
      return {
        name,
        ...(brand && { brand }),
        ...parseQuantity(found.quantity),
        ...(imageOf(found) && { imageUrl: `/api/products/${barcode}/image` }),
      };
    },

    /** The product's front image, fetched from Open Food Facts' image host only. */
    async image(barcode: string) {
      const url = imageOf(await product(barcode));
      if (!url) return null;
      const response = await request(url);
      if (!response.ok || !response.body) return null;
      return { body: response.body, contentType: response.headers.get("content-type") ?? "image/jpeg" };
    },
  };
}

function imageOf(product: OffProduct | null) {
  const url = product?.image_front_url || product?.image_url;
  return url?.startsWith(IMAGE_HOST) ? url : null;
}

const UNITS: Record<string, { unit: SizeUnit; factor: number }> = {
  g: { unit: "g", factor: 1 },
  gr: { unit: "g", factor: 1 },
  gram: { unit: "g", factor: 1 },
  kg: { unit: "kg", factor: 1 },
  ml: { unit: "ml", factor: 1 },
  cl: { unit: "ml", factor: 10 },
  l: { unit: "l", factor: 1 },
  ltr: { unit: "l", factor: 1 },
  liter: { unit: "l", factor: 1 },
};

/**
 * "85 g", "1,5 L", "250ml", "400 g ℮" → a size; anything else (e.g. "10 x 20 g")
 * → nothing. The ℮ (estimated quantity) mark is often typed as a plain "e".
 */
export function parseQuantity(quantity: string | undefined): { sizeValue?: number; sizeUnit?: SizeUnit } {
  const match = quantity?.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)\.?(?:\s*[e℮])?$/u);
  const unit = match && UNITS[match[2]];
  if (!match || !unit) return {};
  const value = Number(match[1].replace(",", ".")) * unit.factor;
  return value > 0 ? { sizeValue: value, sizeUnit: unit.unit } : {};
}

type Session = (request: Request) => Promise<unknown>;

/** GET handlers for a barcode's suggestion and image; both need a session. */
export function createProductHandlers({ off, session }: { off: OpenFoodFacts; session: Session }) {
  async function guard(request: Request, barcode: string) {
    if (!(await session(request))) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (!/^(\d{8}|\d{13})$/.test(barcode)) return Response.json({ error: "invalid barcode" }, { status: 400 });
    return null;
  }

  return {
    async lookup(request: Request, barcode: string) {
      const refused = await guard(request, barcode);
      if (refused) return refused;
      const suggestion = await off.lookup(barcode).catch(() => null);
      return suggestion ? Response.json(suggestion) : Response.json({ error: "not found" }, { status: 404 });
    },

    async image(request: Request, barcode: string) {
      const refused = await guard(request, barcode);
      if (refused) return refused;
      const image = await off.image(barcode).catch(() => null);
      if (!image) return new Response(null, { status: 404 });
      return new Response(image.body, { headers: { "content-type": image.contentType, "cache-control": "private, max-age=86400" } });
    },
  };
}
