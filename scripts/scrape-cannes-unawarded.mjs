/**
 * Scrape "Unawarded" entry rows from Love The Work winners-shortlists hub pages.
 *
 * URL shape (compound tag filter):
 *   /en/awards/winners-shortlists/cannes-lions/{slug}?tag=
 *   publication+dates%40%40year%40%40{year}%23%23trophies%40%40award+level%40%40unawarded
 * Pagination: same URL with &page=2, &page=3, ...
 *
 * Embedded data: Next.js flight chunks with `basicCardsProps` arrays (searchContentType "Entry").
 * Fields: title.text (work name), subText (subcategory entered), supportText (agency), url (entry path).
 * Subcategory codes (B01, B02, …): hub `subText` is usually short (e.g. "Sound Design"); we map to
 * canonical labels from `web/public/category-details.json` → `probabilities.bySubcategory` keys
 * (see `resolve-canonical-subcategory.mjs`), unless you supply per-year lists in
 * `scripts/data/cannes-subcategories-by-year.json` (see `canonical-subcategory-labels.mjs`).
 * Curated sector/shorthand overrides live in `scripts/data/subcategory-hub-aliases.json`.
 * Output `subcategory` is canonical; `subcategory_hub` is raw.
 *
 * Outputs: data/processed/cannes_unawarded.jsonl, .csv, cannes_unawarded_manifest.json
 *
 * Env:
 *   CANNES_YEAR_MIN (default 2015), CANNES_YEAR_MAX (default calendar year)
 *   CANNES_SLUG — optional; scrape one category only
 *   DELAY_MS (default 500) — delay between HTTP requests
 *   CANNES_SUBCATEGORIES_BY_YEAR_PATH — optional path to JSON with per-year label lists
 *     (default `scripts/data/cannes-subcategories-by-year.json`, relative to repo root)
 *
 * Follow-up (not in this script): wire cannes_unawarded.jsonl into web/public or build-category-stats.mjs
 * once product needs it; file can be large.
 *
 * Usage: node scripts/scrape-cannes-unawarded.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CATEGORY_SLUGS } from "./lib/cannes-category-slugs.mjs";
import {
  extractUnawardedPage,
  normalizeText,
} from "./lib/extract-hub-unawarded.mjs";
import { resolveCanonicalSubcategory } from "./lib/resolve-canonical-subcategory.mjs";
import {
  canonicalLabelsForSlugYear,
} from "./lib/canonical-subcategory-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const BASE =
  "https://www.lovethework.com/en/awards/winners-shortlists/cannes-lions";
const USER_AGENT =
  "Mozilla/5.0 (compatible; CannesDecoded/1.0; +https://github.com/inoffensive/CannesDecoded)";
const DELAY_MS = Number(process.env.DELAY_MS ?? 500);
const MAX_RETRIES = 4;

const YEAR_MIN = Number(process.env.CANNES_YEAR_MIN ?? 2015);
const YEAR_MAX = Number(
  process.env.CANNES_YEAR_MAX ?? new Date().getFullYear(),
);
const SLUG_FILTER = (process.env.CANNES_SLUG ?? "").trim();
const SUBCATEGORIES_BY_YEAR_PATH_RAW = (
  process.env.CANNES_SUBCATEGORIES_BY_YEAR_PATH ?? ""
).trim();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Same encoding as manual hub filter: year + Unawarded trophy level. */
function tagUnawarded(year) {
  return `publication+dates%40%40year%40%40${year}%23%23trophies%40%40award+level%40%40unawarded`;
}

function hubUrl(slug, year, page) {
  const tag = tagUnawarded(year);
  let u = `${BASE}/${slug}?tag=${tag}`;
  if (page > 1) u += `&page=${page}`;
  return u;
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

function loadCategoryDetailsPayload() {
  const p = path.join(ROOT, "web", "public", "category-details.json");
  if (!fs.existsSync(p)) {
    console.warn(
      `Missing ${p} — subcategory will stay as hub short labels (no B01/B02 prefix).`,
    );
    return null;
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Optional hub→canonical overrides (global + per slug). */
function loadSubcategoryHubAliases() {
  const p = path.join(ROOT, "scripts", "data", "subcategory-hub-aliases.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.warn(`WARN: could not read ${p}:`, e?.message || e);
    return null;
  }
}

/** Resolved path for optional per-festival-year subcategory label lists. */
function resolveSubcategoryYearOverridesPath() {
  if (!SUBCATEGORIES_BY_YEAR_PATH_RAW) {
    return path.join(ROOT, "scripts", "data", "cannes-subcategories-by-year.json");
  }
  return path.isAbsolute(SUBCATEGORIES_BY_YEAR_PATH_RAW)
    ? SUBCATEGORIES_BY_YEAR_PATH_RAW
    : path.join(ROOT, SUBCATEGORIES_BY_YEAR_PATH_RAW);
}

function loadSubcategoryYearOverrides() {
  const p = resolveSubcategoryYearOverridesPath();
  if (!fs.existsSync(p)) {
    return { payload: null, path: p };
  }
  try {
    return { payload: JSON.parse(fs.readFileSync(p, "utf8")), path: p };
  } catch (e) {
    console.warn(`WARN: could not read ${p}:`, e?.message || e);
    return { payload: null, path: p };
  }
}

/**
 * Fetch all pages for one category-year; dedupe rows by entry_url.
 * @param {string[]} canonicalLabels - from category-details for `slug`
 * @param {object | null} hubAliases - from `scripts/data/subcategory-hub-aliases.json`
 */
async function scrapeCategoryYear(slug, year, canonicalLabels, hubAliases) {
  const seen = new Set();
  const out = [];

  const html1 = await fetchPage(hubUrl(slug, year, 1));
  const first = extractUnawardedPage(html1);
  for (const row of first.rows) {
    const key = row.entry_url;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push({ ...row, _source_url: hubUrl(slug, year, 1) });
  }

  let totalPages = 1;
  if (first.meta && first.meta.pageSize > 0) {
    totalPages = Math.max(
      1,
      Math.ceil(first.meta.totalCount / first.meta.pageSize),
    );
  }

  for (let page = 2; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    const url = hubUrl(slug, year, page);
    const html = await fetchPage(url);
    const { rows } = extractUnawardedPage(html);
    for (const row of rows) {
      const key = row.entry_url;
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push({ ...row, _source_url: url });
    }
  }

  return {
    rows: out.map(({ _source_url, ...r }) => {
      const hubSub = normalizeText(r.subcategory);
      const { subcategory: resolved } = resolveCanonicalSubcategory(
        hubSub,
        canonicalLabels,
        { slug, aliases: hubAliases },
      );
      return {
        work_name: normalizeText(r.work_name),
        subcategory: normalizeText(resolved),
        subcategory_hub: hubSub,
        agency: normalizeText(r.agency),
        entry_url: r.entry_url,
        source_url: _source_url,
      };
    }),
    totalPages,
    meta: first.meta,
  };
}

async function main() {
  const outDir = path.join(ROOT, "data", "processed");
  fs.mkdirSync(outDir, { recursive: true });

  const years = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) years.push(y);

  let slugs = CATEGORY_SLUGS;
  if (SLUG_FILTER) {
    if (!slugs.includes(SLUG_FILTER)) {
      console.error(`Unknown CANNES_SLUG: ${SLUG_FILTER}`);
      process.exit(1);
    }
    slugs = [SLUG_FILTER];
  }

  const categoryDetails = loadCategoryDetailsPayload();
  const hubAliases = loadSubcategoryHubAliases();
  const { payload: subcategoryYearOverrides, path: subcategoryYearOverridesPath } =
    loadSubcategoryYearOverrides();

  const manifest = {
    generated_at: new Date().toISOString(),
    source: BASE,
    script: "scripts/scrape-cannes-unawarded.mjs",
    tag: "publication+dates@@year@@YEAR##trophies@@award level@@unawarded",
    subcategory_year_overrides_path: subcategoryYearOverridesPath,
    years,
    categories: slugs.length,
    totals: {
      ok: 0,
      fetch_error: 0,
      parse_empty: 0,
      row_count: 0,
    },
    /** Per category-year summary */
    byKey: [],
  };

  const jsonlPath = path.join(outDir, "cannes_unawarded.jsonl");
  const csvPath = path.join(outDir, "cannes_unawarded.csv");
  const manifestPath = path.join(outDir, "cannes_unawarded_manifest.json");

  const jsonlLines = [];
  const csvRows = [];

  const header = [
    "year",
    "category_slug",
    "subcategory",
    "subcategory_hub",
    "work_name",
    "agency",
    "entry_url",
    "source_url",
  ].join(",");
  csvRows.push(header);

  for (const year of years) {
    for (const slug of slugs) {
      const key = `${year}/${slug}`;
      const rec = {
        key,
        year,
        category_slug: slug,
        status: "pending",
        row_count: 0,
        total_pages: 0,
        error: null,
      };
      try {
        const { labels: canonicalLabels, source: labelSource } =
          canonicalLabelsForSlugYear(
            categoryDetails,
            slug,
            year,
            subcategoryYearOverrides,
          );
        const { rows, totalPages, meta } = await scrapeCategoryYear(
          slug,
          year,
          canonicalLabels,
          hubAliases,
        );
        rec.subcategory_labels_source = labelSource;
        rec.total_pages = totalPages;
        rec.row_count = rows.length;
        rec.status = rows.length === 0 ? "empty" : "ok";
        manifest.totals.ok++;
        if (rows.length === 0) manifest.totals.parse_empty++;

        for (const row of rows) {
          const line = {
            year,
            category_slug: slug,
            subcategory: row.subcategory,
            subcategory_hub: row.subcategory_hub,
            work_name: row.work_name,
            agency: row.agency,
            entry_url: row.entry_url,
            source_url: row.source_url,
          };
          jsonlLines.push(JSON.stringify(line));
          csvRows.push(
            [
              year,
              slug,
              csvEscape(line.subcategory),
              csvEscape(line.subcategory_hub),
              csvEscape(line.work_name),
              csvEscape(line.agency),
              csvEscape(line.entry_url ?? ""),
              csvEscape(line.source_url),
            ].join(","),
          );
        }
        manifest.totals.row_count += rows.length;
        rec.meta_total_count = meta?.totalCount ?? null;
        rec.meta_page_size = meta?.pageSize ?? null;
      } catch (e) {
        rec.status = "fetch_error";
        rec.error = String(e?.message || e);
        manifest.totals.fetch_error++;
        console.warn(`WARN ${key}: ${rec.error}`);
      }
      manifest.byKey.push(rec);
      await sleep(DELAY_MS);
    }
  }

  fs.writeFileSync(jsonlPath, jsonlLines.join("\n") + (jsonlLines.length ? "\n" : ""), "utf8");
  fs.writeFileSync(csvPath, csvRows.join("\n") + "\n", "utf8");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    `Done. ${manifest.totals.row_count} rows → ${jsonlPath}, ${csvPath} (ok≈${manifest.totals.ok}, empty=${manifest.totals.parse_empty}, fetch_error=${manifest.totals.fetch_error})`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
