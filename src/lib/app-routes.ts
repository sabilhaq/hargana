/** Every screen of the app; the service worker caches these for offline use. */
export const APP_ROUTES = [
  "/",
  "/login",
  "/settings",
  "/settings/regions",
  "/settings/stores",
  "/settings/categories",
  "/settings/unknown-barcodes",
  "/item",
  "/items/edit",
] as const;
