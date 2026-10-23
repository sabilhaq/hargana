import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "./db/schema";
import type { Db } from "./sync";

const NINETY_DAYS = 60 * 60 * 24 * 90;

// BETTER_AUTH_URL names the production URL, so a Vercel preview's own URLs
// (per deployment and per branch) must be trusted for sign-in to work there.
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
  .filter((host): host is string => !!host)
  .map((host) => `https://${host}`);

/**
 * Hargana's auth settings over a database. Sign-up is closed in the app:
 * accounts come from `pnpm user:create` or an invite, which build an instance
 * with sign-up allowed. The first account is the owner; later ones are
 * contributors (friends helping collect prices).
 */
export function authOptions(database: Db, { allowSignUp = false } = {}) {
  return {
    database: drizzleAdapter(database, { provider: "pg", schema }),
    trustedOrigins: vercelOrigins,
    emailAndPassword: { enabled: true, disableSignUp: !allowSignUp },
    user: {
      additionalFields: {
        // Set by the server only: never accepted from a sign-up form.
        role: { type: "string", required: false, defaultValue: "contributor", input: false },
      },
    },
    session: {
      // Long-lived so offline use is never interrupted by a logout.
      expiresIn: NINETY_DAYS,
      updateAge: 60 * 60 * 24,
    },
  } satisfies BetterAuthOptions;
}
