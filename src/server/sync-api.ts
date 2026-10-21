import { auth } from "./auth";
import { db } from "./db";
import { createSyncHandlers } from "./sync";

export const syncHandlers = createSyncHandlers({
  db,
  session: (request) => auth.api.getSession({ headers: request.headers }),
});
