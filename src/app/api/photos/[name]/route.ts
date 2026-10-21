import { photoHandlers } from "@/server/photo-api";

export async function GET(request: Request, { params }: RouteContext<"/api/photos/[name]">) {
  return photoHandlers.serve(request, (await params).name);
}
