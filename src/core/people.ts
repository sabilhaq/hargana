import type { HarganaStorage } from "./storage";
import type { Recorder, User } from "./types";

/** The signed-in user on this device, kept so recording works offline. */
const CURRENT_USER = "currentUser";
/** Every user's name by id, as last pulled from the server. */
const USER_NAMES = "userNames";

/** The id to stamp on a new record: the signed-in user, or null before anyone signed in. */
export async function recorderId(storage: HarganaStorage) {
  return ((await storage.settings.get(CURRENT_USER))?.value as User | undefined)?.id ?? null;
}

/** Who recorded what: resolves a stored user id to a name, marking the signed-in user. */
export async function recorders(storage: HarganaStorage) {
  const [me, names] = await Promise.all([storage.settings.get(CURRENT_USER), storage.settings.get(USER_NAMES)]);
  const current = me?.value as User | undefined;
  const byId = { ...((names?.value as Record<string, string> | undefined) ?? {}) };
  if (current) byId[current.id] ??= current.name;
  return (id: string | null | undefined): Recorder | null =>
    id ? { id, name: byId[id] ?? null, isMe: id === current?.id } : null;
}

/** Remembers names pulled from the server. */
export async function saveUserNames(storage: HarganaStorage, users: User[]) {
  if (users.length === 0) return;
  const current = ((await storage.settings.get(USER_NAMES))?.value as Record<string, string> | undefined) ?? {};
  for (const user of users) current[user.id] = user.name;
  await storage.settings.put({ key: USER_NAMES, value: current });
}

export function people(storage: HarganaStorage) {
  return {
    /** Called with the signed-in user whenever the app knows it; new records are stamped with it. */
    async setCurrentUser(user: User | null) {
      if (user) await storage.settings.put({ key: CURRENT_USER, value: { id: user.id, name: user.name, role: user.role } });
      else await storage.settings.delete(CURRENT_USER);
    },
    /** The signed-in user as last known on this device. */
    async currentUser(): Promise<User | null> {
      return ((await storage.settings.get(CURRENT_USER))?.value as User | undefined) ?? null;
    },
  };
}
