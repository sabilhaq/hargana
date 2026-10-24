import { memberHandlers } from "@/server/member-api";

export async function POST(request: Request, { params }: RouteContext<"/api/members/[id]">) {
  return memberHandlers.change(request, (await params).id);
}
