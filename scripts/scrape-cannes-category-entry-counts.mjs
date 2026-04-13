/**
 * Scrape total entry counts per Cannes Lions category per year from The Work
 * winners-shortlists hub pages (e.g. .../cannes-lions/film?tag=publication+dates%40%40year%40%402025).
 *
 * Usage: node scripts/scrape-cannes-category-entry-counts.mjs
 * Outputs: data/processed/cannes_category_entry_counts.json, .csv
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CATEGORY_SLUGS } from "./lib/cannes-category-slugs.mjs";
import { parseEntryCount } from "./lib/parse-hub-entry-count.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const YEARS = [];
for (let y = 2015; y <= 2025; y++) YEARS.push(y);

const BASE =
  "https://www.lovethework.com/en/awards/winners-shortlists/cannes-lions";
const USER_AGENT =
  "Mozilla/5.0 (compatible; CannesDecoded/1.0; +https://example.invalid)";
const DELAY_MS = 500;
const MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Same tag shape as the site UI: publication+dates@@year@@YYYY */
function yearTag(year) {
  return `publication+dates%40%40year%40%40${year}`;
}

async function fetchPage(url) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          await sleep(1000 * attempt);
          continue;
        }
        throw lastErr;
      }
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
    }
  }
  throw lastErr;
}

function csvEscape(s) {
  if (s == null) return "";
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

async function main() {
  const outDir = path.join(ROOT, "data", "processed");
  fs.mkdirSync(outDir, { recursive: true });

  const rows = [];
  const manifest = {
    generated_at: new Date().toISOString(),
    source: BASE,
    script: "scripts/scrape-cannes-category-entry-counts.mjs",
    years: YEARS,
    categories: CATEGORY_SLUGS.length,
    totals: { ok: 0, missing_count: 0, fetch_error: 0 },
  };

  for (const year of YEARS) {
    for (const slug of CATEGORY_SLUGS) {
      const tag = yearTag(year);
      const url = `${BASE}/${slug}?tag=${tag}`;
      const rec = {
        year,
        category_slug: slug,
        url,
        entries: null,
        status: "pending",
      };
      try {
        const html = await fetchPage(url);
        const n = parseEntryCount(html);
        if (n === null || Number.isNaN(n)) {
          rec.status = "missing_count";
          rec.entries = null;
          manifest.totals.missing_count++;
          console.warn(`WARN ${year} ${slug}: could not parse entry count`);
        } else {
          rec.entries = n;
          rec.status = "ok";
          manifest.totals.ok++;
        }
      } catch (e) {
        rec.status = "fetch_error";
        rec.error = String(e?.message || e);
        manifest.totals.fetch_error++;
        console.warn(`WARN ${year} ${slug}: ${rec.error}`);
      }
      rows.push(rec);
      await sleep(DELAY_MS);
    }
  }

  const jsonPath = path.join(outDir, "cannes_category_entry_counts.json");
  const csvPath = path.join(outDir, "cannes_category_entry_counts.csv");
  const manifestPath = path.join(outDir, "cannes_category_entry_counts_manifest.json");

  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ manifest, rows }, null, 2) + "\n",
    "utf8",
  );

  const header = "year,category_slug,entries,status,url";
  const lines = [header];
  for (const r of rows) {
    lines.push(
      [
        r.year,
        r.category_slug,
        r.entries ?? "",
        r.status,
        r.url,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  fs.writeFileSync(csvPath, lines.join("\n") + "\n", "utf8");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    `Done. ${rows.length} rows → ${jsonPath}, ${csvPath} (ok=${manifest.totals.ok}, missing_count=${manifest.totals.missing_count}, errors=${manifest.totals.fetch_error})`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
