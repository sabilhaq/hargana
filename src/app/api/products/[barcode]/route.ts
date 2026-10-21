import { productHandlers } from "@/server/product-api";

export async function GET(request: Request, { params }: RouteContext<"/api/products/[barcode]">) {
  return productHandlers.lookup(request, (await params).barcode);
}
