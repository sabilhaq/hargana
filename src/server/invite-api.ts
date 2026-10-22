import { auth, createAuth } from "./auth";
import { db } from "./db";
import { createInviteHandlers, SignUpError } from "./invites";

// Sign-up is closed in `auth`; only a valid invite reaches this instance.
const signUpAuth = createAuth({ allowSignUp: true });

export const inviteHandlers = createInviteHandlers({
  db,
  session: (request) => auth.api.getSession({ headers: request.headers }),
  async signUp(body) {
    const response = await signUpAuth.api.signUpEmail({ body, asResponse: true });
    const data = (await response.json()) as { user?: { id: string }; code?: string };
    if (!response.ok || !data.user) throw new SignUpError(data.code ?? "sign_up_failed");
    return { userId: data.user.id, setCookie: response.headers.getSetCookie() };
  },
});
