/**
 * Run scrape-cannes-hub-taxonomy.mjs once per festival year (merge-friendly).
 * Use after initial passes; fills 2016–2024 when you already have 2015 + 2025.
 *
 * Usage: node scripts/scrape-cannes-hub-taxonomy-batch.mjs
 * Env: DELAY_MS, CANNES_YEAR_MIN (default 2016), CANNES_YEAR_MAX (default 2024)
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const script = path.join(__dirname, "scrape-cannes-hub-taxonomy.mjs");

const DELAY_MS = process.env.DELAY_MS ?? "400";
const y0 = Number(process.env.CANNES_YEAR_MIN ?? 2016);
const y1 = Number(process.env.CANNES_YEAR_MAX ?? 2024);

function runYear(year) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      CANNES_YEAR_MIN: String(year),
      CANNES_YEAR_MAX: String(year),
      DELAY_MS,
    };
    const p = spawn(process.execPath, [script], {
      cwd: ROOT,
      env,
      stdio: "inherit",
    });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`exit ${code}`)),
    );
  });
}

async function main() {
  for (let y = y0; y <= y1; y++) {
    console.log(`\n=== Taxonomy year ${y} ===\n`);
    await runYear(y);
  }
  console.log("Batch done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
