import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";

const NINETY_DAYS = 60 * 60 * 24 * 90;

// Hargana is single-user: sign-up is closed in the app. The owner account is
// created once with `pnpm user:create`, which builds an instance with sign-up allowed.
export function createAuth({ allowSignUp = false } = {}) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, disableSignUp: !allowSignUp },
    session: {
      // Long-lived so offline use is never interrupted by a logout.
      expiresIn: NINETY_DAYS,
      updateAge: 60 * 60 * 24,
    },
  });
}

export const auth = createAuth();
