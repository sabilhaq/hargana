// On-device photo compression: one JPEG of about 150 KB for viewing, and a
// small thumbnail kept for offline display.

const IMAGE = { maxEdge: 1280, budget: 150 * 1024 };
const THUMB = { maxEdge: 240, budget: 20 * 1024 };
const QUALITIES = [0.82, 0.72, 0.62, 0.52];

export type CompressedPhoto = { image: ArrayBuffer; thumb: ArrayBuffer };

export async function compressPhoto(file: Blob): Promise<CompressedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return { image: await encode(bitmap, IMAGE), thumb: await encode(bitmap, THUMB) };
  } finally {
    bitmap.close();
  }
}

/** The largest, best-looking JPEG within the budget: lower quality first, then smaller. */
async function encode(bitmap: ImageBitmap, { maxEdge, budget }: { maxEdge: number; budget: number }) {
  for (let edge = maxEdge; ; edge = Math.round(edge * 0.75)) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of QUALITIES) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("This browser cannot encode JPEG");
      if (blob.size <= budget || edge < 64) return blob.arrayBuffer();
    }
  }
}
