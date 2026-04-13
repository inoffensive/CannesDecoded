/**
 * Merge awarded results (cannes_lovethework_with_points.jsonl) and unawarded
 * (cannes_unawarded.jsonl) into one JSONL + reconciliation summary.
 *
 * Dedupe key: normalized entry_url.
 *
 * Usage: node scripts/merge-cannes-entries.mjs
 * Output: data/processed/cannes_entries_merged.jsonl, cannes_entries_merged_report.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { lionCategoryToSlug } from "./lib/lion-category-to-slug.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function normalizeUrl(u) {
  if (u == null || u === "") return null;
  try {
    const x = new URL(String(u));
    x.hash = "";
    return x.href.replace(/\/$/, "");
  } catch {
    return String(u).trim() || null;
  }
}

function main() {
  const awardedPath = path.join(
    ROOT,
    "data",
    "processed",
    "cannes_lovethework_with_points.jsonl",
  );
  const rawAwardedPath = path.join(ROOT, "data", "processed", "cannes_lovethework.jsonl");
  const unawardedPath = path.join(ROOT, "data", "processed", "cannes_unawarded.jsonl");
  const outJsonl = path.join(ROOT, "data", "processed", "cannes_entries_merged.jsonl");
  const outReport = path.join(ROOT, "data", "processed", "cannes_entries_merged_report.json");

  let awardedLines = [];
  if (fs.existsSync(awardedPath)) {
    awardedLines = fs.readFileSync(awardedPath, "utf8").trim().split("\n").filter(Boolean);
  } else if (fs.existsSync(rawAwardedPath)) {
    awardedLines = fs.readFileSync(rawAwardedPath, "utf8").trim().split("\n").filter(Boolean);
  }

  const unawardedLines = fs.existsSync(unawardedPath)
    ? fs.readFileSync(unawardedPath, "utf8").trim().split("\n").filter(Boolean)
    : [];

  const byUrl = new Map();
  const report = {
    generated_at: new Date().toISOString(),
    awarded_source: fs.existsSync(awardedPath)
      ? awardedPath
      : rawAwardedPath,
    unawarded_source: unawardedPath,
    counts: {
      awarded_lines: awardedLines.length,
      unawarded_lines: unawardedLines.length,
      merged_unique_urls: 0,
      overlap_awarded_unawarded: 0,
      awarded_without_url: 0,
      unawarded_without_url: 0,
    },
    overlap_urls: [],
  };

  for (const line of awardedLines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const url = normalizeUrl(rec.entry_url);
    if (!url) {
      report.counts.awarded_without_url++;
      continue;
    }
    const listType = rec.list_type === "winner" ? "winner" : "shortlist";
    const outcome = listType === "winner" ? "winner" : "shortlist";
    const slugFromLion =
      rec.category_slug ?? lionCategoryToSlug(rec.lion_category) ?? null;
    const row = {
      source: "lovethework_results",
      year: rec.year,
      category_slug: slugFromLion,
      lion_category: rec.lion_category ?? null,
      entry_type_id: rec.entry_type_id ?? null,
      subcategory: rec.subcategory ?? "",
      outcome,
      list_type: rec.list_type ?? null,
      prize: rec.prize ?? "",
      award: rec.award ?? "",
      points: rec.points ?? null,
      points_rule: rec.points_rule ?? null,
      title: rec.title ?? "",
      brand: rec.brand ?? "",
      entry_url: url,
    };
    const prev = byUrl.get(url);
    if (prev) {
      /* Prefer awarded row with more detail; skip duplicate lines */
      continue;
    }
    byUrl.set(url, row);
  }

  for (const line of unawardedLines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const url = normalizeUrl(rec.entry_url);
    if (!url) {
      report.counts.unawarded_without_url++;
      continue;
    }
    const prev = byUrl.get(url);
    if (prev) {
      report.counts.overlap_awarded_unawarded++;
      report.overlap_urls.push(url);
      continue;
    }
    byUrl.set(url, {
      source: "lovethework_unawarded",
      year: rec.year,
      category_slug: rec.category_slug ?? null,
      lion_category: null,
      entry_type_id: null,
      subcategory: rec.subcategory ?? "",
      subcategory_hub: rec.subcategory_hub ?? "",
      outcome: "unawarded",
      list_type: null,
      prize: "",
      award: "",
      points: null,
      points_rule: null,
      title: rec.work_name ?? "",
      brand: "",
      entry_url: url,
      agency: rec.agency ?? "",
    });
  }

  report.counts.merged_unique_urls = byUrl.size;
  const linesOut = [...byUrl.values()].sort((a, b) => {
    const y = Number(a.year) - Number(b.year);
    if (y !== 0) return y;
    const s = String(a.category_slug || "").localeCompare(
      String(b.category_slug || ""),
      "en",
    );
    if (s !== 0) return s;
    return String(a.entry_url).localeCompare(String(b.entry_url), "en");
  });

  fs.writeFileSync(
    outJsonl,
    linesOut.map((o) => JSON.stringify(o)).join("\n") + (linesOut.length ? "\n" : ""),
    "utf8",
  );
  fs.writeFileSync(outReport, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(
    `Wrote ${outJsonl} (${linesOut.length} rows), report → ${outReport}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
