import { asc, eq } from "drizzle-orm";
import * as schema from "./db/schema";
import type { Db } from "./sync";

type Session = (request: Request) => Promise<{ user: { id: string; role?: string | null } } | null>;

/** What the owner sees of each person with an account. */
export type Member = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "contributor";
  joinedAt: string;
  deactivatedAt: string | null;
};

/**
 * The owner's view of who uses Hargana: list everyone, and deactivate or
 * reactivate a contributor. Deactivating ends every session of theirs at once;
 * the auth setup refuses them a new one (auth-options.ts) until reactivated.
 * What they recorded stays.
 */
export function createMemberHandlers({ db, session, now = () => new Date() }: { db: Db; session: Session; now?: () => Date }) {
  const { user, session: sessions } = schema;

  async function owner(request: Request) {
    const signedIn = await session(request);
    if (!signedIn) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
    if (signedIn.user.role !== "owner") return { error: Response.json({ error: "owner_only" }, { status: 403 }) };
    return { userId: signedIn.user.id };
  }

  return {
    /** GET → everyone, oldest account first. */
    async list(request: Request) {
      const who = await owner(request);
      if (who.error) return who.error;
      const rows = await db
        .select({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt, deactivatedAt: user.deactivatedAt })
        .from(user)
        .orderBy(asc(user.createdAt));
      const members: Member[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role === "owner" ? "owner" : "contributor",
        joinedAt: r.createdAt.toISOString(),
        deactivatedAt: r.deactivatedAt?.toISOString() ?? null,
      }));
      return Response.json(members);
    },

    /** POST {action: "deactivate" | "reactivate"} on /api/members/<id>. Contributors only. */
    async change(request: Request, id: string) {
      const who = await owner(request);
      if (who.error) return who.error;
      const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
      if (body?.action !== "deactivate" && body?.action !== "reactivate") {
        return Response.json({ error: "action must be deactivate or reactivate" }, { status: 400 });
      }
      const [member] = await db.select({ role: user.role }).from(user).where(eq(user.id, id));
      if (!member) return Response.json({ error: "not_found" }, { status: 404 });
      if (member.role === "owner" || id === who.userId) return Response.json({ error: "cannot_change_owner" }, { status: 400 });

      if (body.action === "deactivate") {
        await db.update(user).set({ deactivatedAt: now() }).where(eq(user.id, id));
        await db.delete(sessions).where(eq(sessions.userId, id));
      } else {
        await db.update(user).set({ deactivatedAt: null }).where(eq(user.id, id));
      }
      return new Response(null, { status: 204 });
    },
  };
}
