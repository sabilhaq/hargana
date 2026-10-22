import { useTranslations } from "next-intl";
import type { Recorder } from "@/core";

/** "kamu" for my own records, otherwise the person's name ("pengguna lain" until names have synced). */
export function useRecorderName() {
  const t = useTranslations("Recorder");
  return (recorder: Recorder) => (recorder.isMe ? t("me") : (recorder.name ?? t("unknown")));
}
