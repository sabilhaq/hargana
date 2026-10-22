import { count, eq } from "drizzle-orm";
import { createAuth } from "@/server/auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

async function main() {
  const [email = process.env.DEV_OWNER_EMAIL, password = process.env.DEV_OWNER_PASSWORD, name = "Owner"] =
    process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: pnpm user:create <email> <password> [name]");
    process.exit(1);
  }
  const auth = createAuth({ allowSignUp: true });
  const [{ users }] = await db.select({ users: count() }).from(user);
  const created = await auth.api.signUpEmail({ body: { email, password, name } });
  // The first account runs Hargana; everyone after helps collect prices.
  const role = users === 0 ? "owner" : "contributor";
  if (role === "owner") await db.update(user).set({ role }).where(eq(user.id, created.user.id));
  console.log(`Created ${role} ${email}.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
