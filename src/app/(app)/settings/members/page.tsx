"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import type { Member } from "@/server/members";
import { usePermissions } from "../../permissions";
import { Empty, FormError, List, Screen } from "../../ui";

/** The owner sees everyone with an account and can take a friend's access away, or give it back. Needs a connection. */
export default function MembersPage() {
  const t = useTranslations("Members");
  const format = useFormatter();
  const { canManageSettings } = usePermissions();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/members");
      if (!response.ok) throw new Error(String(response.status));
      setMembers(await response.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!canManageSettings) return;
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [canManageSettings, load]);

  async function change(member: Member, action: "deactivate" | "reactivate") {
    if (action === "deactivate" && !window.confirm(t("confirmDeactivate", { name: member.name }))) return;
    setBusy(member.id);
    try {
      const response = await fetch(`/api/members/${member.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(String(response.status));
      await load();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  if (!canManageSettings) {
    return (
      <Screen title={t("title")} back="/settings">
        <Empty>{t("ownerOnly")}</Empty>
      </Screen>
    );
  }

  const day = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });
  return (
    <Screen title={t("title")} back="/settings">
      <p className="text-sm opacity-70">{t("intro")}</p>
      <FormError error={failed ? t("needsConnection") : null} />
      {members && (
        <List>
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className={`flex min-w-0 flex-col ${member.deactivatedAt ? "opacity-50" : ""}`}>
                <span className="truncate font-medium">{member.name}</span>
                <span className="truncate text-sm opacity-60">{member.email}</span>
                <span className="text-sm opacity-60">
                  {member.deactivatedAt ? t("deactivated") : t(member.role)} · {t("joined", { date: day(member.joinedAt) })}
                </span>
              </div>
              {member.role === "contributor" && (
                <button
                  type="button"
                  disabled={busy === member.id}
                  onClick={() => change(member, member.deactivatedAt ? "reactivate" : "deactivate")}
                  className={`shrink-0 text-sm font-semibold disabled:opacity-50 ${member.deactivatedAt ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
                >
                  {member.deactivatedAt ? t("reactivate") : t("deactivate")}
                </button>
              )}
            </li>
          ))}
        </List>
      )}
    </Screen>
  );
}
