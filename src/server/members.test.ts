import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { authOptions } from "./auth-options";
import * as schema from "./db/schema";
import { createMemberHandlers, type Member } from "./members";
import { database } from "./testing";

// Starting the in-memory Postgres takes a while; do it before the timed tests.
beforeAll(() => database(), 60_000);

/** The real auth setup, an owner and a friend signed in on two devices, and the member handlers. */
async function setUp() {
  const db = await database();
  const auth = betterAuth({ ...authOptions(db, { allowSignUp: true }), baseURL: "http://hargana.test" });
  const account = async (name: string, role: "owner" | "contributor") => {
    const email = `${crypto.randomUUID()}@hargana.test`;
    const { user } = await auth.api.signUpEmail({ body: { name, email, password: "rahasia-sekali-1" } });
    await db.update(schema.user).set({ role }).where(eq(schema.user.id, user.id));
    return { id: user.id, email, role };
  };
  const owner = await account("Sabil", "owner");
  const friend = await account("Budi", "contributor");

  const signIn = async (email: string) => {
    const response = await auth.api.signInEmail({ body: { email, password: "rahasia-sekali-1" }, asResponse: true });
    const cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return { status: response.status, code: response.ok ? null : ((await response.json()) as { code?: string }).code, cookie };
  };
  const session = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) });

  let signedIn: { id: string; role: string } = owner;
  const handlers = createMemberHandlers({ db, session: async () => ({ user: signedIn }) });
  const send = (method: string, path: string, body?: unknown) =>
    new Request(`http://hargana.test${path}`, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });
  const change = (id: string, action: string) => handlers.change(send("POST", `/api/members/${id}`, { action }), id);
  const list = async () => (await (await handlers.list(send("GET", "/api/members"))).json()) as Member[];

  return { db, owner, friend, signIn, session, change, list, handlers, send, as: (who: { id: string; role: string }) => (signedIn = who) };
}

describe("removing a friend's access", () => {
  it("signs them out everywhere and refuses sign-in until reactivated", async () => {
    const { friend, signIn, session, change, list } = await setUp();
    const phone = await signIn(friend.email);
    const laptop = await signIn(friend.email);
    expect(await session(phone.cookie)).not.toBeNull();

    expect((await change(friend.id, "deactivate")).status).toBe(204);

    expect(await session(phone.cookie)).toBeNull();
    expect(await session(laptop.cookie)).toBeNull();
    expect(await signIn(friend.email)).toMatchObject({ status: 403, code: "ACCOUNT_DEACTIVATED" });
    expect((await list()).find((m) => m.id === friend.id)).toMatchObject({ name: "Budi", deactivatedAt: expect.any(String) });

    expect((await change(friend.id, "reactivate")).status).toBe(204);
    const again = await signIn(friend.email);
    expect(again.status).toBe(200);
    expect((await session(again.cookie))?.user.name).toBe("Budi");
  });

  it("keeps their account and name, so what they recorded stays theirs", async () => {
    const { db, friend, change } = await setUp();

    await change(friend.id, "deactivate");

    const [row] = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, friend.id));
    expect(row).toEqual({ name: "Budi" });
  });

  it("is the owner's alone, and never touches an owner", async () => {
    const { owner, friend, change, handlers, send, as } = await setUp();

    expect((await change(owner.id, "deactivate")).status).toBe(400);
    expect((await change(friend.id, "promote")).status).toBe(400);
    expect((await change("no-such-person", "deactivate")).status).toBe(404);

    as(friend);
    expect((await handlers.list(send("GET", "/api/members"))).status).toBe(403);
    expect((await change(owner.id, "deactivate")).status).toBe(403);
  });
});
