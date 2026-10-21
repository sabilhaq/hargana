import { productHandlers } from "@/server/product-api";

export async function GET(request: Request, { params }: RouteContext<"/api/products/[barcode]/image">) {
  return productHandlers.image(request, (await params).barcode);
}
