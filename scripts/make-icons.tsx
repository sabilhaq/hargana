// Renders the app icons into public/icons. Re-run after changing the design:
//   pnpm tsx scripts/make-icons.tsx
import { writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";

const GREEN = "#15803d";

// `padding` shrinks the mark for maskable icons, whose outer 20% may be cropped.
function icon(size: number, padding = 0) {
  const inner = size * (1 - padding * 2);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: GREEN,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: inner * 0.62,
            height: inner * 0.62,
            borderRadius: inner * 0.14,
            background: "white",
            color: GREEN,
            fontSize: inner * 0.5,
            fontWeight: 700,
          }}
        >
          H
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}

async function write(name: string, response: ImageResponse) {
  writeFileSync(`public/icons/${name}`, Buffer.from(await response.arrayBuffer()));
  console.log(`public/icons/${name}`);
}

async function main() {
  await write("icon-192.png", icon(192));
  await write("icon-512.png", icon(512));
  await write("maskable-512.png", icon(512, 0.1));
  await write("apple-touch-icon.png", icon(180));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
