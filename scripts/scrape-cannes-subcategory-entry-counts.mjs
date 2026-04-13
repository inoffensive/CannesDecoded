/**
 * Per–sub-category entry counts from hub hero (year + Lions Award Category facet).
 * Reads facet list from data/processed/cannes_taxonomy_by_year.json (from scrape-cannes-hub-taxonomy.mjs).
 *
 * Usage: node scripts/scrape-cannes-subcategory-entry-counts.mjs
 * Env: CANNES_YEAR_MIN, CANNES_YEAR_MAX, CANNES_SLUG, DELAY_MS
 * Output: data/processed/cannes_subcategory_entry_counts.json, .csv, _manifest.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  hubWinnersShortlistsUrl,
  yearPlusSubcategoryTagEncoded,
} from "./lib/lovethework-hub-tags.mjs";
import { fetchHubPage, sleep } from "./lib/hub-fetch.mjs";
import { parseEntryCount } from "./lib/parse-hub-entry-count.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const DELAY_MS = Number(process.env.DELAY_MS ?? 500);
const YEAR_MIN = Number(process.env.CANNES_YEAR_MIN ?? 2015);
const YEAR_MAX = Number(process.env.CANNES_YEAR_MAX ?? 2025);
const SLUG_FILTER = (process.env.CANNES_SLUG ?? "").trim();

function csvEscape(s) {
  if (s == null) return "";
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function loadTaxonomy() {
  const p = path.join(ROOT, "data", "processed", "cannes_taxonomy_by_year.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing ${p}. Run: node scripts/scrape-cannes-hub-taxonomy.mjs`,
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  const tax = loadTaxonomy();
  const byYear = tax.byYear || {};
  const rows = [];
  const manifest = {
    generated_at: new Date().toISOString(),
    source: "https://www.lovethework.com",
    script: "scripts/scrape-cannes-subcategory-entry-counts.mjs",
    taxonomy_path: path.join(ROOT, "data", "processed", "cannes_taxonomy_by_year.json"),
    years: [],
    totals: { ok: 0, missing_count: 0, fetch_error: 0, skipped: 0 },
  };

  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) manifest.years.push(y);

  for (let year = YEAR_MIN; year <= YEAR_MAX; year++) {
    const ys = String(year);
    const yearBlock = byYear[ys];
    if (!yearBlock?.bySlug) continue;

    const slugs = SLUG_FILTER
      ? [SLUG_FILTER]
      : Object.keys(yearBlock.bySlug).sort((a, b) => a.localeCompare(b, "en"));

    for (const slug of slugs) {
      const slugRec = yearBlock.bySlug[slug];
      const pairs = slugRec?.facet_pairs;
      if (!Array.isArray(pairs) || pairs.length === 0) {
        manifest.totals.skipped++;
        continue;
      }

      for (const pair of pairs) {
        const level2 = pair.level2;
        const level3 = pair.level3;
        const tag = yearPlusSubcategoryTagEncoded(year, level2, level3);
        const url = hubWinnersShortlistsUrl(slug, tag);
        const rec = {
          year,
          category_slug: slug,
          level2,
          level3,
          url,
          entries: null,
          status: "pending",
        };
        try {
          const html = await fetchHubPage(url);
          const n = parseEntryCount(html);
          if (n === null || Number.isNaN(n)) {
            rec.status = "missing_count";
            manifest.totals.missing_count++;
          } else {
            rec.entries = n;
            rec.status = "ok";
            manifest.totals.ok++;
          }
        } catch (e) {
          rec.status = "fetch_error";
          rec.error = String(e?.message || e);
          manifest.totals.fetch_error++;
        }
        rows.push(rec);
        await sleep(DELAY_MS);
      }
    }
  }

  const outDir = path.join(ROOT, "data", "processed");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "cannes_subcategory_entry_counts.json");
  const csvPath = path.join(outDir, "cannes_subcategory_entry_counts.csv");
  const manifestPath = path.join(outDir, "cannes_subcategory_entry_counts_manifest.json");

  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ manifest, rows }, null, 2) + "\n",
    "utf8",
  );

  const header =
    "year,category_slug,level2,level3,entries,status,url";
  const lines = [header];
  for (const r of rows) {
    lines.push(
      [
        r.year,
        r.category_slug,
        csvEscape(r.level2),
        csvEscape(r.level3),
        r.entries ?? "",
        r.status,
        csvEscape(r.url),
      ].join(","),
    );
  }
  fs.writeFileSync(csvPath, lines.join("\n") + "\n", "utf8");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  /** Sum sub counts vs category hero totals from cannes_category_entry_counts.json */
  const countsPath = path.join(ROOT, "data", "processed", "cannes_category_entry_counts.json");
  let reconciliation = null;
  if (fs.existsSync(countsPath)) {
    const doc = JSON.parse(fs.readFileSync(countsPath, "utf8"));
    const catRows = doc.rows || [];
    const catMap = new Map();
    for (const r of catRows) {
      catMap.set(`${r.year}\u0000${r.category_slug}`, r.entries);
    }
    const byKey = new Map();
    for (const r of rows) {
      if (r.status !== "ok" || r.entries == null) continue;
      const k = `${r.year}\u0000${r.category_slug}`;
      byKey.set(k, (byKey.get(k) ?? 0) + r.entries);
    }
    const mismatches = [];
    for (const [k, sumSub] of byKey) {
      const catTotal = catMap.get(k);
      if (catTotal == null || Number.isNaN(catTotal)) continue;
      if (sumSub !== catTotal) {
        const [year, slug] = k.split("\u0000");
        mismatches.push({
          year: Number(year),
          category_slug: slug,
          category_entries: catTotal,
          sum_subcategory_entries: sumSub,
          delta: sumSub - catTotal,
        });
      }
    }
    reconciliation = { mismatches };
    const reconPath = path.join(
      ROOT,
      "data",
      "processed",
      "cannes_subcategory_entry_counts_reconciliation.json",
    );
    fs.writeFileSync(reconPath, JSON.stringify(reconciliation, null, 2) + "\n", "utf8");
    manifest.reconciliation_path = reconPath;
    manifest.reconciliation_mismatch_count = mismatches.length;
  }

  console.log(
    `Done. ${rows.length} rows → ${jsonPath} (ok=${manifest.totals.ok}, missing=${manifest.totals.missing_count}, errors=${manifest.totals.fetch_error}, skipped_slugs=${manifest.totals.skipped})`,
  );
  if (reconciliation != null) {
    console.log(
      `Reconciliation: ${reconciliation.mismatches.length} year/slug sums ≠ category total (see manifest)`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
