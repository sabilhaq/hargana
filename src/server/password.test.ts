import { betterAuth } from "better-auth";
import { beforeAll, describe, expect, it } from "vitest";
import { authOptions } from "./auth-options";
import { database } from "./testing";

// Starting the in-memory Postgres takes a while; do it before the timed tests.
beforeAll(() => database(), 60_000);

/** The real auth setup over the test database, and one account signed in on two devices. */
async function setUp() {
  const db = await database();
  const auth = betterAuth({ ...authOptions(db, { allowSignUp: true }), baseURL: "http://hargana.test" });
  const email = `${crypto.randomUUID()}@hargana.test`;
  await auth.api.signUpEmail({ body: { name: "Budi", email, password: "lama-sekali-1" } });

  /** Signs in and returns the cookie a browser would send back. */
  async function signIn(password: string) {
    const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    if (!response.ok) return null;
    return cookieOf(response);
  }
  const cookieOf = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  const session = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) });

  return { auth, signIn, cookieOf, session, phone: (await signIn("lama-sekali-1"))!, laptop: (await signIn("lama-sekali-1"))! };
}

describe("changing your own password", () => {
  it("replaces the password, signs other devices out, and keeps this one signed in", async () => {
    const { auth, signIn, cookieOf, session, phone, laptop } = await setUp();

    // What the Settings form sends, as the signed-in phone.
    const response = await auth.api.changePassword({
      body: { currentPassword: "lama-sekali-1", newPassword: "baru-sekali-2", revokeOtherSessions: true },
      headers: new Headers({ cookie: phone }),
      asResponse: true,
    });

    expect(response.status).toBe(200);
    expect((await session(cookieOf(response)))?.user.name).toBe("Budi"); // the phone carries on
    expect(await session(laptop)).toBeNull(); // the laptop is signed out
    expect(await signIn("lama-sekali-1")).toBeNull();
    expect(await signIn("baru-sekali-2")).not.toBeNull();
  });

  it("refuses a wrong current password or a too-short new one, and changes nothing", async () => {
    const { auth, signIn, session, phone, laptop } = await setUp();
    const change = (currentPassword: string, newPassword: string) =>
      auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: new Headers({ cookie: phone }), asResponse: true });

    const wrong = await change("bukan-ini-3", "baru-sekali-2");
    const short = await change("lama-sekali-1", "pendek");

    expect([wrong.status, (await wrong.json()).code]).toEqual([400, "INVALID_PASSWORD"]);
    expect([short.status, (await short.json()).code]).toEqual([400, "PASSWORD_TOO_SHORT"]);
    expect(await session(laptop)).not.toBeNull();
    expect(await signIn("lama-sekali-1")).not.toBeNull();
  });
});

describe("signing up", () => {
  it("is closed in the app's own auth: accounts come only from invites and the user:create script", async () => {
    const db = await database();
    const app = betterAuth({ ...authOptions(db), baseURL: "http://hargana.test" });

    const response = await app.api.signUpEmail({
      body: { name: "Orang Asing", email: `${crypto.randomUUID()}@hargana.test`, password: "apa-saja-123" },
      asResponse: true,
    });

    expect([response.status, (await response.json()).code]).toEqual([400, "EMAIL_PASSWORD_SIGN_UP_DISABLED"]);
  });
});
