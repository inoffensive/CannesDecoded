/**
 * Reads data/processed/cannes_lovethework.jsonl and writes
 * data/processed/cannes_lovethework_with_points.jsonl with
 * points, points_rule, category_slug on each line.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pointsForRecord } from "./lib/award-points.mjs";
import { lionCategoryToSlug } from "./lib/lion-category-to-slug.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const inPath = path.join(ROOT, "data/processed/cannes_lovethework.jsonl");
const outPath = path.join(ROOT, "data/processed/cannes_lovethework_with_points.jsonl");

const lines = fs.readFileSync(inPath, "utf8").trim().split("\n");
const out = [];
for (const line of lines) {
  const rec = JSON.parse(line);
  const { points, rule, reason } = pointsForRecord(rec);
  const category_slug = lionCategoryToSlug(rec.lion_category);
  out.push(
    JSON.stringify({
      ...rec,
      points,
      points_rule: rule,
      points_reason: reason ?? null,
      category_slug,
    }),
  );
}
fs.writeFileSync(outPath, out.join("\n") + "\n", "utf8");
console.log(`Wrote ${out.length} rows → ${outPath}`);
