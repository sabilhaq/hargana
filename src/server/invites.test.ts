import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "./db/schema";
import { createInviteHandlers, INVITE_DAYS, SignUpError, type InviteSummary } from "./invites";
import { database, TEST_USERS } from "./testing";

// Starting the in-memory Postgres takes a while; do it before the timed tests.
beforeAll(() => database(), 60_000);

const DAY = 24 * 60 * 60 * 1000;
const BASE = "https://hargana.test";

/** Invite handlers over the test database, with a movable clock and a fake sign-up that records accounts. */
async function setUp() {
  const db = await database();
  let signedIn: { id: string; role: string } | null = TEST_USERS.owner;
  let time = new Date("2026-10-22T08:00:00Z");
  const accounts: { id: string; email: string }[] = [];
  const handlers = createInviteHandlers({
    db,
    session: async () => (signedIn ? { user: signedIn } : null),
    now: () => new Date(time),
    async signUp({ name, email }) {
      if (accounts.some((a) => a.email === email)) throw new SignUpError("USER_ALREADY_EXISTS");
      const id = crypto.randomUUID();
      await db.insert(schema.user).values({ id, name, email: `${id}@${email.split("@")[1]}` });
      accounts.push({ id, email });
      return { userId: id, setCookie: [`session=${id}; Path=/; HttpOnly`] };
    },
  });
  const send = (method: string, path: string, body?: unknown) =>
    new Request(`${BASE}${path}`, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });

  async function invite(name?: string) {
    const response = await handlers.create(send("POST", "/api/invites", { name }));
    return (await response.json()) as { id: string; url: string; expiresAt: string };
  }
  const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;
  const accept = (token: string, email: string, password = "rahasia-budi-1") =>
    handlers.accept(send("POST", "/api/invites/accept", { token, name: "Budi", email, password }));
  const check = async (token: string) => (await (await handlers.check(send("GET", `/api/invites/check?token=${token}`))).json()) as { valid: boolean; name?: string | null };
  const list = async () => (await (await handlers.list(send("GET", "/api/invites"))).json()) as InviteSummary[];

  return {
    db,
    handlers,
    send,
    invite,
    tokenOf,
    accept,
    check,
    list,
    accounts,
    signInAs: (user: { id: string; role: string } | null) => (signedIn = user),
    advance: (ms: number) => (time = new Date(time.getTime() + ms)),
  };
}

describe("invites", () => {
  it("create exactly one contributor account, sign it in, and then stop working", async () => {
    const { db, invite, tokenOf, accept, check, list, accounts } = await setUp();
    const { url, expiresAt } = await invite("Budi");
    expect(url).toMatch(/^https:\/\/hargana\.test\/invite\?token=[\w-]{32}$/);
    expect(new Date(expiresAt).getTime() - new Date("2026-10-22T08:00:00Z").getTime()).toBe(INVITE_DAYS * DAY);
    expect(await check(tokenOf(url))).toEqual({ valid: true, name: "Budi" });

    const response = await accept(tokenOf(url), "Budi@Mail.test");
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/^session=/);
    expect(accounts).toEqual([{ id: expect.any(String), email: "budi@mail.test" }]);
    const [created] = await db.select().from(schema.user).where(eq(schema.user.id, accounts[0].id));
    expect(created.role).toBe("contributor");

    expect((await accept(tokenOf(url), "other@mail.test")).status).toBe(410);
    expect(await check(tokenOf(url))).toEqual({ valid: false });
    expect(accounts).toHaveLength(1);
    expect((await list()).map((i) => i.status)).toEqual(["used"]);
  });

  it("are refused after they expire or are cancelled", async () => {
    const { handlers, send, invite, tokenOf, accept, list, advance } = await setUp();
    const late = await invite("Late");
    const cancelled = await invite("Cancelled");
    expect((await handlers.cancel(send("DELETE", `/api/invites/${cancelled.id}`), cancelled.id)).status).toBe(204);
    expect((await accept(tokenOf(cancelled.url), "c@mail.test")).status).toBe(410);

    advance(INVITE_DAYS * DAY + 1);
    expect((await accept(tokenOf(late.url), "l@mail.test")).status).toBe(410);
    expect(Object.fromEntries((await list()).map((i) => [i.name, i.status]))).toEqual({ Late: "expired", Cancelled: "cancelled" });
  });

  it("stay usable when sign-up fails, e.g. an email already registered", async () => {
    const { invite, tokenOf, accept, check } = await setUp();
    const first = await invite();
    const second = await invite();
    await accept(tokenOf(first.url), "dup@mail.test");

    const failed = await accept(tokenOf(second.url), "dup@mail.test");
    expect([failed.status, await failed.json()]).toEqual([400, { error: "USER_ALREADY_EXISTS" }]);
    expect((await check(tokenOf(second.url))).valid).toBe(true);
    expect((await accept(tokenOf(second.url), "fresh@mail.test")).status).toBe(200);
  });

  it("can only be created, listed or cancelled by the owner", async () => {
    const { handlers, send, invite, signInAs } = await setUp();
    const { id } = await invite();

    signInAs(TEST_USERS.budi);
    expect((await handlers.create(send("POST", "/api/invites", {}))).status).toBe(403);
    expect((await handlers.list(send("GET", "/api/invites"))).status).toBe(403);
    expect((await handlers.cancel(send("DELETE", `/api/invites/${id}`), id)).status).toBe(403);
    signInAs(null);
    expect((await handlers.create(send("POST", "/api/invites", {}))).status).toBe(401);
  });

  it("need every field and a real token", async () => {
    const { accept, check, handlers, send } = await setUp();
    expect((await accept("made-up-token", "x@mail.test")).status).toBe(410);
    expect(await check("made-up-token")).toEqual({ valid: false });
    expect((await handlers.accept(send("POST", "/api/invites/accept", { token: "t", email: "x@mail.test" }))).status).toBe(400);
  });
});
