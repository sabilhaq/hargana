import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import * as schema from "./db/schema";
import type { Db } from "./sync";

/** How long an invite link works. */
export const INVITE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type Session = (request: Request) => Promise<{ user: { id: string; role?: string | null } } | null>;

/** Creates the account; throws SignUpError with Better Auth's code when it can't. */
export type SignUp = (input: { name: string; email: string; password: string }) => Promise<{ userId: string; setCookie: string[] }>;

export class SignUpError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** What the owner sees of an invite; the token itself is only returned when it is created. */
export type InviteSummary = {
  id: string;
  name: string | null;
  createdAt: string;
  expiresAt: string;
  status: "open" | "used" | "expired" | "cancelled";
};

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Invites: the owner creates, lists and cancels them; anyone holding a valid
 * link can check it and use it once to create a contributor account.
 */
export function createInviteHandlers({ db, session, signUp, now = () => new Date() }: { db: Db; session: Session; signUp: SignUp; now?: () => Date }) {
  const { invites } = schema;

  async function owner(request: Request) {
    const signedIn = await session(request);
    if (!signedIn) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
    if (signedIn.user.role !== "owner") return { error: Response.json({ error: "owner_only" }, { status: 403 }) };
    return { userId: signedIn.user.id };
  }

  /** The open invite with this token, if any. */
  async function findOpen(token: string) {
    const [invite] = await db
      .select()
      .from(invites)
      .where(and(eq(invites.tokenHash, hash(token)), isNull(invites.usedAt), isNull(invites.cancelledAt), gt(invites.expiresAt, now())));
    return invite;
  }

  return {
    /** POST {name?} → the link, shown once. */
    async create(request: Request) {
      const who = await owner(request);
      if (who.error) return who.error;
      const body = (await request.json().catch(() => ({}))) as { name?: unknown };
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : null;
      const token = randomBytes(24).toString("base64url");
      const created = now();
      const invite = {
        id: crypto.randomUUID(),
        tokenHash: hash(token),
        name,
        createdBy: who.userId,
        createdAt: created,
        expiresAt: new Date(created.getTime() + INVITE_DAYS * DAY_MS),
      };
      await db.insert(invites).values(invite);
      const url = new URL(`/invite?token=${token}`, request.url).toString();
      return Response.json({ id: invite.id, name, url, expiresAt: invite.expiresAt.toISOString() });
    },

    /** GET → recent invites, newest first. */
    async list(request: Request) {
      const who = await owner(request);
      if (who.error) return who.error;
      const rows = await db.select().from(invites).orderBy(desc(invites.createdAt)).limit(50);
      const summaries: InviteSummary[] = rows.map((i) => ({
        id: i.id,
        name: i.name,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
        status: i.usedAt ? "used" : i.cancelledAt ? "cancelled" : i.expiresAt <= now() ? "expired" : "open",
      }));
      return Response.json(summaries);
    },

    /** DELETE /api/invites/<id> → the link stops working (an invite already used is unaffected). */
    async cancel(request: Request, id: string) {
      const who = await owner(request);
      if (who.error) return who.error;
      await db.update(invites).set({ cancelledAt: now() }).where(and(eq(invites.id, id), isNull(invites.usedAt), isNull(invites.cancelledAt)));
      return new Response(null, { status: 204 });
    },

    /** GET ?token= → whether the link still works, and who it is for. No session needed. */
    async check(request: Request) {
      const token = new URL(request.url).searchParams.get("token") ?? "";
      const invite = token ? await findOpen(token) : undefined;
      return Response.json(invite ? { valid: true, name: invite.name } : { valid: false });
    },

    /**
     * POST {token, name, email, password} → creates a contributor account and
     * signs it in. The invite is claimed first, in one statement, so a link
     * can never create two accounts; if sign-up then fails it is released.
     */
    async accept(request: Request) {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const [token, name, email, password] = ["token", "name", "email", "password"].map((k) =>
        typeof body?.[k] === "string" ? (body[k] as string).trim() : "",
      );
      if (!token || !name || !email || !password) return Response.json({ error: "missing_fields" }, { status: 400 });

      const [claimed] = await db
        .update(invites)
        .set({ usedAt: now() })
        .where(and(eq(invites.tokenHash, hash(token)), isNull(invites.usedAt), isNull(invites.cancelledAt), gt(invites.expiresAt, now())))
        .returning({ id: invites.id });
      if (!claimed) return Response.json({ error: "invalid_invite" }, { status: 410 });

      try {
        const { userId, setCookie } = await signUp({ name, email: email.toLowerCase(), password });
        await db.update(invites).set({ usedBy: userId }).where(eq(invites.id, claimed.id));
        const response = Response.json({ ok: true });
        for (const cookie of setCookie) response.headers.append("set-cookie", cookie);
        return response;
      } catch (error) {
        await db.update(invites).set({ usedAt: sql`null` }).where(eq(invites.id, claimed.id));
        if (error instanceof SignUpError) return Response.json({ error: error.code }, { status: 400 });
        throw error;
      }
    },
  };
}
