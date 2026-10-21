// Finds barcodes in camera frames, on the device. Uses the browser's
// BarcodeDetector where it reads retail codes (Android Chrome), otherwise the
// zxing-wasm decoder (iOS Safari), served from our own origin so it works offline.
//
// It only reports what it sees; whether a code is a valid product barcode is
// the core's decision.

/** A code seen in a frame. `format` uses BarcodeDetector names: ean_13, qr_code… */
export type Detection = { rawValue: string; format: string };
export type Detect = (video: HTMLVideoElement) => Promise<Detection[]>;

// QR codes are read too, so the app can say "not a product code".
const WANTED = ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code"];

type NativeDetector = {
  detect(source: CanvasImageSource): Promise<{ rawValue: string; format: string }[]>;
};
type NativeDetectorClass = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
};

export async function createDetector(): Promise<Detect> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    const supported = await Native.getSupportedFormats().catch(() => [] as string[]);
    const formats = WANTED.filter((format) => supported.includes(format));
    if (formats.includes("ean_13")) {
      const detector = new Native({ formats });
      return async (video) => (await detector.detect(video)).map(({ rawValue, format }) => ({ rawValue, format }));
    }
  }
  return zxingDetector();
}

const ZXING_FORMATS = { EAN13: "ean_13", EAN8: "ean_8", UPCA: "upc_a", UPCE: "upc_e", QRCode: "qr_code" } as const;

async function zxingDetector(): Promise<Detect> {
  const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? process.env.NEXT_PUBLIC_ZXING_WASM! : prefix + path,
    },
  });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true })!;

  return async (video) => {
    if (!video.videoWidth) return [];
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    const results = await readBarcodes(context.getImageData(0, 0, canvas.width, canvas.height), {
      formats: Object.keys(ZXING_FORMATS) as (keyof typeof ZXING_FORMATS)[],
      tryHarder: true,
      maxNumberOfSymbols: 1,
    });
    return results
      .filter((result) => result.isValid)
      .map((result) => ({
        rawValue: result.text,
        format: ZXING_FORMATS[result.format as keyof typeof ZXING_FORMATS] ?? result.format.toLowerCase(),
      }));
  };
}
