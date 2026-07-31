import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const initialFiles = [
  "index.html",
  "styles.css",
  "game.js",
  "poki-wrapper.js",
  "save-system.js",
  "localization/en.js",
  "levels/base-game.js",
  "expansions/expansion-registry.js"
];
const limits = {
  initialBytes: 5 * 1024 * 1024,
  totalBytes: 8 * 1024 * 1024
};
const files = await Promise.all(initialFiles.map(async (path) => {
  const contents = await readFile(path);
  return { path, bytes: contents.byteLength, gzipBytes: gzipSync(contents).byteLength };
}));
const totals = files.reduce((result, file) => ({
  bytes: result.bytes + file.bytes,
  gzipBytes: result.gzipBytes + file.gzipBytes
}), { bytes: 0, gzipBytes: 0 });
const report = {
  limits,
  totals,
  withinBudget: totals.bytes <= limits.initialBytes && totals.bytes <= limits.totalBytes,
  files
};

await mkdir("dist", { recursive: true });
await writeFile("dist/build-size-report.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(`Initial payload: ${(totals.bytes / 1024).toFixed(1)} KiB raw, ${(totals.gzipBytes / 1024).toFixed(1)} KiB gzip.`);
if (!report.withinBudget) throw new Error("Initial payload exceeds the configured Poki size budget.");
