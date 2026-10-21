import { createAuth } from "@/server/auth";

// Sets a new password for an existing user and signs them out everywhere, so a
// leaked or forgotten password stops working at once. Sign-up and password
// reset are not offered in the app, so this is the way to change it.
async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: pnpm user:password <email> <new-password>");
    process.exit(1);
  }
  const context = await createAuth().$context;
  const { minPasswordLength, maxPasswordLength } = context.password.config;
  if (password.length < minPasswordLength || password.length > maxPasswordLength) {
    console.error(`The password must be ${minPasswordLength}–${maxPasswordLength} characters.`);
    process.exit(1);
  }
  const found = await context.internalAdapter.findUserByEmail(email.toLowerCase());
  if (!found) {
    console.error(`No user with email ${email}.`);
    process.exit(1);
  }
  await context.internalAdapter.updatePassword(found.user.id, await context.password.hash(password));
  await context.internalAdapter.deleteUserSessions(found.user.id);
  console.log(`Password changed for ${found.user.email}; all their sessions were signed out.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
