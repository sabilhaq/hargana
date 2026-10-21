"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { PhotoView } from "@/core";
import { Sheet, useCoreData } from "../ui";

/** An object URL for JPEG bytes, revoked when they change or the component goes. */
export function useBytesUrl(bytes: ArrayBuffer | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) return;
    const next = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL must be created and revoked with the bytes
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(null);
    };
  }, [bytes]);
  return url;
}

/**
 * An item's photo thumbnail; tapping it shows the full image. The thumbnail is
 * stored on the device so it shows offline; the full image needs a connection
 * once it has been uploaded.
 */
export function ItemPhoto({ itemId, version }: { itemId: string; version?: unknown }) {
  const [photo] = useCoreData((core) => core.itemPhoto(itemId), [itemId, version]);
  if (!photo) return null;
  return <PhotoThumb photo={photo} />;
}

function PhotoThumb({ photo }: { photo: PhotoView }) {
  const t = useTranslations("Photos");
  const [open, setOpen] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const thumb = useBytesUrl(photo.thumb) ?? photo.thumbUrl;
  const local = useBytesUrl(open ? photo.image : null);
  const full = local ?? (unreachable ? null : photo.imageUrl);
  if (!thumb) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("view")} className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URLs and private photos */}
        <img src={thumb} alt="" className="size-24 rounded-xl border border-neutral-200 object-cover dark:border-neutral-800" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("title")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URLs and private photos */}
        <img src={full ?? thumb} alt="" onError={() => setUnreachable(true)} className="w-full rounded-xl" />
        {!full && <p className="mt-2 text-center text-sm opacity-60">{t("offline")}</p>}
      </Sheet>
    </>
  );
}
