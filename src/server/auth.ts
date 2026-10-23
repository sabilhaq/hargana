import { betterAuth } from "better-auth";
import { authOptions } from "./auth-options";
import { db } from "./db";

export function createAuth({ allowSignUp = false } = {}) {
  return betterAuth(authOptions(db, { allowSignUp }));
}

export const auth = createAuth();
