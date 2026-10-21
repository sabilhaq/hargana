// Fails if source uses physical-direction CSS, so RTL (Arabic) can be enabled
// later without a refactor. Use start/end (ms-, me-, ps-, pe-, text-start…).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const tailwind =
  /(?<![\w-])-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-[\w.[\]/]+|(?<![\w-])(text-left|text-right|float-left|float-right)(?![\w-])/;
const css = /(margin|padding|border)-(left|right)\s*:|(?<![\w-])(left|right)\s*:|text-align\s*:\s*(left|right)/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(tsx?|css)$/.test(name)) yield path;
  }
}

const problems = [];
for (const file of files("src")) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (tailwind.test(line) || css.test(line)) problems.push(`${file}:${i + 1}: ${line.trim()}`);
    });
}

if (problems.length) {
  console.error("Physical-direction CSS found (use logical start/end instead):\n" + problems.join("\n"));
  process.exit(1);
}
console.log("Logical CSS check passed.");
