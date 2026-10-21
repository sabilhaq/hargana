import { describe, expect, it } from "vitest";
import { createProductHandlers, openFoodFacts, parseQuantity } from "./open-food-facts";

const INDOMIE = "0089686010947";

/** A stand-in for Open Food Facts: products by barcode, images by URL. */
function fakeOff(products: Record<string, object>, images: Record<string, string> = {}) {
  const requests: { url: string; userAgent: string | null }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, userAgent: new Headers(init?.headers).get("user-agent") });
    if (images[url]) return new Response(images[url], { headers: { "content-type": "image/jpeg" } });
    const barcode = url.match(/product\/(\d+)\.json/)?.[1];
    const product = barcode && products[barcode];
    return Response.json(product ? { status: 1, product } : { status: 0 });
  };
  return { off: openFoodFacts({ fetch: fetch as typeof globalThis.fetch }), requests };
}

describe("Open Food Facts", () => {
  it("turns a product into a suggestion", async () => {
    const { off, requests } = fakeOff({
      [INDOMIE]: {
        product_name: "Mi Goreng",
        product_name_id: "Indomie Mi Goreng",
        brands: "Indomie, Indofood",
        quantity: "85 g",
        image_front_url: "https://images.openfoodfacts.org/images/products/front.jpg",
      },
    });

    expect(await off.lookup(INDOMIE)).toEqual({
      name: "Indomie Mi Goreng",
      brand: "Indomie",
      sizeValue: 85,
      sizeUnit: "g",
      imageUrl: `/api/products/${INDOMIE}/image`,
    });
    expect(requests[0].userAgent).toMatch(/^Hargana\//);
  });

  it("has no suggestion for unknown products or ones without a name", async () => {
    const { off } = fakeOff({ "8992388101016": { brands: "Bango" } });

    expect(await off.lookup("8992388101016")).toBeNull();
    expect(await off.lookup("8888888888888")).toBeNull();
  });

  it("fetches images only from its own image host", async () => {
    const front = "https://images.openfoodfacts.org/images/products/front.jpg";
    const { off } = fakeOff(
      { [INDOMIE]: { product_name: "Mi", image_front_url: front }, "8992388101016": { product_name: "Kecap", image_front_url: "https://evil.example/x.jpg" } },
      { [front]: "jpeg-bytes" },
    );

    const image = await off.image(INDOMIE);
    expect(await new Response(image!.body).text()).toBe("jpeg-bytes");
    expect(await off.image("8992388101016")).toBeNull();
    expect(await off.lookup("8992388101016")).not.toHaveProperty("imageUrl");
  });

  it("reads sizes in common forms", () => {
    expect(parseQuantity("85 g")).toEqual({ sizeValue: 85, sizeUnit: "g" });
    expect(parseQuantity("1,5 L")).toEqual({ sizeValue: 1.5, sizeUnit: "l" });
    expect(parseQuantity("250ml")).toEqual({ sizeValue: 250, sizeUnit: "ml" });
    expect(parseQuantity("33 cl")).toEqual({ sizeValue: 330, sizeUnit: "ml" });
    expect(parseQuantity("400 g e")).toEqual({ sizeValue: 400, sizeUnit: "g" });
    expect(parseQuantity("1 l ℮")).toEqual({ sizeValue: 1, sizeUnit: "l" });
    expect(parseQuantity("10 x 20 g")).toEqual({});
    expect(parseQuantity(undefined)).toEqual({});
  });
});

describe("the product API", () => {
  it("requires a session and a valid barcode, and answers 404 when unknown", async () => {
    let signedIn = false;
    const { off } = fakeOff({ [INDOMIE]: { product_name: "Mi" } });
    const handlers = createProductHandlers({ off, session: async () => signedIn });
    const get = (barcode: string) => handlers.lookup(new Request(`http://hargana.test/api/products/${barcode}`), barcode);

    expect((await get(INDOMIE)).status).toBe(401);
    signedIn = true;
    expect(await (await get(INDOMIE)).json()).toEqual({ name: "Mi" });
    expect((await get("8888888888888")).status).toBe(404);
    expect((await get("../x")).status).toBe(400);
  });
});
