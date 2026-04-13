/**
 * Enumerate Lions Award Category facets (level2 × level3) per hub slug and festival
 * year by paginating winners-shortlists search results (year filter only).
 *
 * Also merges optional `cannes_lovethework.jsonl` for raw `lion_category` strings and
 * unmapped labels (see lion-category-to-slug.mjs).
 *
 * Usage: node scripts/scrape-cannes-hub-taxonomy.mjs
 * Env: CANNES_YEAR_MIN, CANNES_YEAR_MAX, CANNES_SLUG, DELAY_MS (default 500)
 * Output: data/processed/cannes_taxonomy_by_year.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CATEGORY_SLUGS } from "./lib/cannes-category-slugs.mjs";
import {
  extractLionsAwardCategoryFacetPairs,
  extractSearchPaginationFromHtml,
} from "./lib/extract-hub-search-results.mjs";
import { yearTagEncoded, hubWinnersShortlistsUrl } from "./lib/lovethework-hub-tags.mjs";
import { fetchHubPage, sleep } from "./lib/hub-fetch.mjs";
import { lionCategoryToSlug } from "./lib/lion-category-to-slug.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const DELAY_MS = Number(process.env.DELAY_MS ?? 500);
const YEAR_MIN = Number(process.env.CANNES_YEAR_MIN ?? 2015);
const YEAR_MAX = Number(process.env.CANNES_YEAR_MAX ?? 2025);
const SLUG_FILTER = (process.env.CANNES_SLUG ?? "").trim();

function loadOptionalLovetheworkJsonl() {
  const p = path.join(ROOT, "data", "processed", "cannes_lovethework.jsonl");
  if (!fs.existsSync(p)) return { path: p, byYear: null };
  const byYear = {};
  for (const line of fs.readFileSync(p, "utf8").trim().split("\n")) {
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const y = rec.year;
    const lc = rec.lion_category;
    if (y == null || lc == null) continue;
    const ys = String(y);
    if (!byYear[ys]) byYear[ys] = new Set();
    byYear[ys].add(String(lc).trim());
  }
  for (const ys of Object.keys(byYear)) {
    byYear[ys] = [...byYear[ys]].sort((a, b) => a.localeCompare(b, "en"));
  }
  return { path: p, byYear };
}

function facetKey(p) {
  return `${p.level2}\u0000${p.level3}`;
}

async function enumerateSlugYear(slug, year) {
  const tag = yearTagEncoded(year);
  let page = 1;
  let totalPages = 1;
  const merged = new Map();
  let totalCount = 0;
  let pageSize = 24;

  while (page <= totalPages) {
    let url = hubWinnersShortlistsUrl(slug, tag);
    if (page > 1) url += `&page=${page}`;
    const html = await fetchHubPage(url);
    const meta = extractSearchPaginationFromHtml(html);
    if (meta) {
      totalCount = meta.totalCount;
      pageSize = Math.max(1, meta.pageSize);
      totalPages = Math.max(1, Math.ceil(meta.totalCount / pageSize));
    } else if (page === 1) {
      return {
        slug,
        year,
        status: "no_search_results",
        hub_entry_count: null,
        facet_pairs: [],
        hub_pages_fetched: 0,
        url: hubWinnersShortlistsUrl(slug, tag),
      };
    }
    const pairs = extractLionsAwardCategoryFacetPairs(html);
    for (const p of pairs) {
      const k = facetKey(p);
      if (!merged.has(k)) merged.set(k, p);
    }
    if (page >= totalPages) break;
    page++;
    await sleep(DELAY_MS);
  }

  const facet_pairs = [...merged.values()].sort((a, b) => {
    const c = a.level2.localeCompare(b.level2, "en");
    return c !== 0 ? c : a.level3.localeCompare(b.level3, "en");
  });

  return {
    slug,
    year,
    status: "ok",
    hub_entry_count: totalCount,
    facet_pairs,
    hub_pages_fetched: totalPages,
    url: hubWinnersShortlistsUrl(slug, tag),
  };
}

function loadExistingTaxonomy(outPath) {
  if (!fs.existsSync(outPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(outPath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const outDir = path.join(ROOT, "data", "processed");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "cannes_taxonomy_by_year.json");
  const existing = loadExistingTaxonomy(outPath);

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

  const { path: lovetheworkPath, byYear: lionByYear } = loadOptionalLovetheworkJsonl();

  const manifest = {
    generated_at: new Date().toISOString(),
    source: "https://www.lovethework.com",
    script: "scripts/scrape-cannes-hub-taxonomy.mjs",
    lovethework_jsonl: lovetheworkPath,
    lovethework_jsonl_loaded: Boolean(lionByYear),
    year_range: { min: YEAR_MIN, max: YEAR_MAX },
    years_in_this_run: years,
    categories: slugs.length,
    merge_with_existing: Boolean(existing),
  };

  /** @type {Record<string, Record<string, unknown>>} */
  const byYear = existing?.byYear
    ? JSON.parse(JSON.stringify(existing.byYear))
    : {};

  /** Seed every festival year from category entry counts so the file has hub totals before facet runs. */
  const countsPathSeed = path.join(
    ROOT,
    "data",
    "processed",
    "cannes_category_entry_counts.json",
  );
  if (fs.existsSync(countsPathSeed)) {
    const doc = JSON.parse(fs.readFileSync(countsPathSeed, "utf8"));
    for (const r of doc.rows || []) {
      const ys = String(r.year);
      if (!byYear[ys]) {
        byYear[ys] = {
          bySlug: {},
          lion_category_strings: [],
          lion_category_unmapped: [],
        };
      }
    }
  }

  for (const year of years) {
    const ys = String(year);
    const prev = byYear[ys];
    const yearOut = {
      bySlug: { ...(prev?.bySlug || {}) },
      lion_category_strings: lionByYear?.[ys] ?? prev?.lion_category_strings ?? [],
      lion_category_unmapped: [],
    };

    if (lionByYear?.[ys]) {
      for (const s of lionByYear[ys]) {
        if (lionCategoryToSlug(s) == null) yearOut.lion_category_unmapped.push(s);
      }
      yearOut.lion_category_unmapped.sort((a, b) => a.localeCompare(b, "en"));
    } else if (prev?.lion_category_unmapped) {
      yearOut.lion_category_unmapped = [...prev.lion_category_unmapped];
    }

    for (const slug of slugs) {
      const key = `${year}/${slug}`;
      try {
        const rec = await enumerateSlugYear(slug, year);
        yearOut.bySlug[slug] = rec;
        console.log(`OK ${key} facets=${rec.facet_pairs?.length ?? 0} pages=${rec.hub_pages_fetched}`);
      } catch (e) {
        yearOut.bySlug[slug] = {
          slug,
          year,
          status: "fetch_error",
          error: String(e?.message || e),
          facet_pairs: [],
        };
        console.warn(`WARN ${key}: ${e?.message || e}`);
      }
      await sleep(DELAY_MS);
    }

    byYear[ys] = yearOut;
  }

  const countsPath = path.join(ROOT, "data", "processed", "cannes_category_entry_counts.json");
  if (fs.existsSync(countsPath)) {
    const doc = JSON.parse(fs.readFileSync(countsPath, "utf8"));
    manifest.category_entry_counts_path = countsPath;
    for (const r of doc.rows || []) {
      const ys = String(r.year);
      if (!byYear[ys]) {
        byYear[ys] = { bySlug: {}, lion_category_strings: [], lion_category_unmapped: [] };
      }
      if (!byYear[ys].category_hub_counts) byYear[ys].category_hub_counts = {};
      byYear[ys].category_hub_counts[r.category_slug] = {
        entries: r.entries,
        status: r.status,
        url: r.url,
      };
      const active = r.status === "ok" && r.entries != null;
      if (!byYear[ys].active_slugs_from_counts) byYear[ys].active_slugs_from_counts = [];
      if (active && !byYear[ys].active_slugs_from_counts.includes(r.category_slug)) {
        byYear[ys].active_slugs_from_counts.push(r.category_slug);
      }
    }
    for (const ys of Object.keys(byYear)) {
      const a = byYear[ys].active_slugs_from_counts;
      if (Array.isArray(a)) a.sort((x, y) => x.localeCompare(y, "en"));
    }
  }

  fs.writeFileSync(
    outPath,
    JSON.stringify({ manifest, byYear }, null, 2) + "\n",
    "utf8",
  );
  console.log(`Wrote ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
