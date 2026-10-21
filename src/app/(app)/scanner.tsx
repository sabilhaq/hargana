"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createDetector, type Detection } from "@/lib/barcode-detector";

/** A code that stays in view is reported again only after it has been gone this long. */
const SAME_CODE_MS = 2500;
const FRAME_INTERVAL_MS = 150;

type Problem = "denied" | "unavailable" | null;

/**
 * Live rear-camera scanner. Detects codes on its own (no shutter button) and
 * hands each new one to `onCode`. Frames never leave the device.
 */
export function Scanner({ onCode }: { onCode: (detection: Detection) => void }) {
  const t = useTranslations("Scanner");
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [torch, setTorch] = useState<{ track: MediaStreamTrack; on: boolean } | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  // Start right away when the camera is already allowed; otherwise wait for a tap.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((status) => !cancelled && status.state === "granted" && setActive(true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Release the camera while the app is in the background.
  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && setActive(false);
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let last: { code: string; seenAt: number } | undefined;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return fail("unavailable");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (error) {
        return fail(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "unavailable");
      }
      if (stopped) return;
      const element = video.current!;
      element.srcObject = stream;
      await element.play().catch(() => {});
      setProblem(null);
      setRunning(true);

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
      if (capabilities?.torch) setTorch({ track, on: false });

      const detect = await createDetector();
      const tick = async () => {
        if (stopped) return;
        try {
          for (const detection of await detect(element)) {
            const now = Date.now();
            const repeat = last?.code === detection.rawValue && now - last.seenAt < SAME_CODE_MS;
            last = { code: detection.rawValue, seenAt: now };
            if (!repeat) onCodeRef.current(detection);
          }
        } catch {
          // A frame that fails to decode is just skipped.
        }
        timer = setTimeout(tick, FRAME_INTERVAL_MS);
      };
      tick();
    }

    function fail(reason: Problem) {
      if (stopped) return;
      setProblem(reason);
      setActive(false);
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      setRunning(false);
      setTorch(null);
    };
  }, [active]);

  async function toggleTorch() {
    if (!torch) return;
    const on = !torch.on;
    await torch.track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => {});
    setTorch({ ...torch, on });
  }

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-neutral-900 text-white">
      <video ref={video} muted playsInline className="size-full object-cover" hidden={!running} />
      {running ? (
        <>
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80" />
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/80">{t("hint")}</p>
          {torch && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torch.on}
              className="absolute end-2 top-2 rounded-full bg-black/50 px-3 py-2 text-sm font-medium aria-pressed:bg-yellow-400 aria-pressed:text-black"
            >
              {t("torch")}
            </button>
          )}
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center">
          {active ? (
            <p className="text-sm opacity-80">{t("starting")}</p>
          ) : (
            <>
              {problem && <p className="text-sm opacity-80">{t(problem)}</p>}
              <button
                type="button"
                onClick={() => setActive(true)}
                className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white"
              >
                {t("start")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
