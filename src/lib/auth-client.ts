import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // The user's role ("owner" or "contributor") comes with the session.
  plugins: [inferAdditionalFields({ user: { role: { type: "string", required: false } } })],
});
