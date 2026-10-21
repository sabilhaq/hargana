import { createAuth } from "@/server/auth";

async function main() {
  const [email = process.env.DEV_OWNER_EMAIL, password = process.env.DEV_OWNER_PASSWORD, name = "Owner"] =
    process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: pnpm user:create <email> <password> [name]");
    process.exit(1);
  }
  const auth = createAuth({ allowSignUp: true });
  await auth.api.signUpEmail({ body: { email, password, name } });
  console.log(`Created user ${email}.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
