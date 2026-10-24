import { auth } from "./auth";
import { db } from "./db";
import { createMemberHandlers } from "./members";

export const memberHandlers = createMemberHandlers({
  db,
  session: (request) => auth.api.getSession({ headers: request.headers }),
});
