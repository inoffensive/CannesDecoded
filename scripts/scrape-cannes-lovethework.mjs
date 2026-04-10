/**
 * Download Cannes Lions winners + shortlists from The Work (lovethework.com),
 * years 2015–2025. Scans entry_type_id from MIN..MAX (default 1..130); IDs without
 * a real Cannes results table are skipped. Embeds JSON in Next.js RSC flight data.
 *
 * Usage: node scripts/scrape-cannes-lovethework.mjs
 * Env: CANNES_ENTRY_TYPE_MIN, CANNES_ENTRY_TYPE_MAX (defaults 1 and 130)
 * Outputs: data/processed/cannes_lovethework.jsonl, .csv, manifest.json
 * Raw HTML: data/raw/html/{year}/{entry_type_id}.html (only for successful pages)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  extractAwardsPayload,
  isCannesLionsResults,
  normalizeText,
} from "./lib/extract-awards-payload.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const YEARS = [];
for (let y = 2015; y <= 2025; y++) YEARS.push(y);
const ENTRY_TYPE_ID_MIN = Number(process.env.CANNES_ENTRY_TYPE_MIN ?? 1);
const ENTRY_TYPE_ID_MAX = Number(process.env.CANNES_ENTRY_TYPE_MAX ?? 130);

const BASE =
  "https://www.lovethework.com/en/awards/results/cannes-lions";
const USER_AGENT =
  "Mozilla/5.0 (compatible; CannesDecoded/1.0; +https://example.invalid)";
const DELAY_MS = 600;
const MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cellText(cell) {
  if (!cell || typeof cell !== "object") return "";
  if (cell.variant === "link" && cell.link?.text != null) {
    return String(cell.link.text).replace(/\s+/g, " ").trim();
  }
  if (cell.variant === "label" && cell.label?.text != null) {
    return String(cell.label.text).replace(/\s+/g, " ").trim();
  }
  return "";
}

function cellEntryUrl(cell) {
  if (cell?.variant === "link" && cell.link?.href) {
    const h = cell.link.href;
    if (h.startsWith("http")) return h;
    return `https://www.lovethework.com${h}`;
  }
  return null;
}

/**
 * Map table row cells to record fields.
 * Winners use 7 columns; shortlists use 5 (no Prize/Award on site).
 */
function rowToFields(cells, listType) {
  const title = normalizeText(cellText(cells[0]));
  const brand = normalizeText(cellText(cells[1]));
  const product_service = normalizeText(cellText(cells[2]));
  const entrant = normalizeText(cellText(cells[3]));
  const location = normalizeText(cellText(cells[4]));
  let prize = "";
  let award = "";
  if (cells.length >= 7) {
    prize = normalizeText(cellText(cells[5]));
    award = normalizeText(cellText(cells[6]));
  } else if (listType === "shortlist" && cells.length >= 5) {
    prize = "Shortlist";
    award = "Shortlist";
  }
  const entry_url = cellEntryUrl(cells[0]);
  return {
    title,
    brand,
    product_service,
    entrant,
    location,
    prize,
    award,
    entry_url,
  };
}

function* sectionsToRecords(payload, listType, meta) {
  const list = listType === "winner" ? payload.winners : payload.shortlists;
  if (!Array.isArray(list)) return;
  for (const section of list) {
    const subcategory = normalizeText(
      (section.title || "").replace(/\s+/g, " ").trim(),
    );
    const rows = section.tableRows || [];
    for (const row of rows) {
      const cells = row.cells || [];
      const minCells = listType === "winner" ? 7 : 5;
      if (cells.length < minCells) continue;
      const f = rowToFields(cells, listType);
      yield {
        ...meta,
        list_type: listType,
        subcategory,
        ...f,
      };
    }
  }
}

async function fetchPage(year, entryTypeId) {
  const url = `${BASE}?year=${year}&entry_type_id=${entryTypeId}`;
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

function recordToCsvLine(r) {
  const cols = [
    r.year,
    r.entry_type_id,
    r.lion_category,
    r.list_type,
    r.subcategory,
    r.title,
    r.brand,
    r.award,
    r.prize,
    r.product_service,
    r.entrant,
    r.location,
    r.entry_url ?? "",
  ];
  return cols.map(csvEscape).join(",");
}

async function main() {
  const rawDir = path.join(ROOT, "data", "raw", "html");
  const outDir = path.join(ROOT, "data", "processed");
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const allRecords = [];
  const manifest = {
    generated_at: new Date().toISOString(),
    source: "https://www.lovethework.com",
    script: "scripts/scrape-cannes-lovethework.mjs",
    years: YEARS,
    entry_type_id_range: {
      min: ENTRY_TYPE_ID_MIN,
      max: ENTRY_TYPE_ID_MAX,
    },
    pages: [],
    totals: {
      records: 0,
      pages_ok: 0,
      pages_skipped: 0,
      pages_failed: 0,
    },
  };

  for (const year of YEARS) {
    for (
      let entry_type_id = ENTRY_TYPE_ID_MIN;
      entry_type_id <= ENTRY_TYPE_ID_MAX;
      entry_type_id++
    ) {
      const pageInfo = { year, entry_type_id, status: "pending" };
      manifest.pages.push(pageInfo);
      const rel = path.join(String(year), `${entry_type_id}.html`);
      const outPath = path.join(rawDir, rel);

      try {
        const html = await fetchPage(year, entry_type_id);

        const payload = extractAwardsPayload(html);
        if (!payload || !isCannesLionsResults(payload)) {
          pageInfo.status = "skipped";
          pageInfo.reason = !payload
            ? "no_cannes_results_table"
            : "not_cannes_lions";
          manifest.totals.pages_skipped++;
          continue;
        }

        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, html, "utf8");

        pageInfo.status = "ok";
        pageInfo.lion_category = normalizeText(payload.category);
        pageInfo.festival_name = normalizeText(payload.festivalName);
        pageInfo.winners_sections = payload.winners?.length ?? 0;
        pageInfo.shortlists_sections = payload.shortlists?.length ?? 0;
        const meta = {
          year,
          entry_type_id,
          lion_category: normalizeText(payload.category || ""),
          festival_name: normalizeText(payload.festivalName || ""),
        };
        let n = 0;
        for (const listType of ["winner", "shortlist"]) {
          for (const rec of sectionsToRecords(payload, listType, meta)) {
            allRecords.push(rec);
            n++;
          }
        }
        pageInfo.records = n;
        manifest.totals.pages_ok++;
      } catch (e) {
        pageInfo.status = "fetch_error";
        pageInfo.error = String(e?.message || e);
        manifest.totals.pages_failed++;
        console.warn(`WARN ${year} entry_type_id=${entry_type_id}: ${pageInfo.error}`);
      }

      await sleep(DELAY_MS);
    }
  }

  manifest.totals.records = allRecords.length;

  const jsonlPath = path.join(outDir, "cannes_lovethework.jsonl");
  const csvPath = path.join(outDir, "cannes_lovethework.csv");
  const manifestPath = path.join(outDir, "manifest.json");

  const header =
    "year,entry_type_id,lion_category,list_type,subcategory,title,brand,award,prize,product_service,entrant,location,entry_url";
  const lines = [header];
  for (const r of allRecords) lines.push(recordToCsvLine(r));

  fs.writeFileSync(jsonlPath, allRecords.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  fs.writeFileSync(csvPath, lines.join("\n") + "\n", "utf8");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    `Done. ${allRecords.length} records → ${jsonlPath}, ${csvPath}, ${manifestPath}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
