import { inviteHandlers } from "@/server/invite-api";

export async function DELETE(request: Request, { params }: RouteContext<"/api/invites/[id]">) {
  return inviteHandlers.cancel(request, (await params).id);
}
