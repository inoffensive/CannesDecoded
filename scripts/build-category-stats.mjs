/**
 * Aggregates category-level stats for the web app from entry counts + enriched JSONL.
 * Run: node scripts/build-category-stats.mjs
 * Output: web/public/category-stats.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { bucketForRule } from "./lib/award-buckets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  const countsPath = path.join(ROOT, "data/processed/cannes_category_entry_counts.csv");
  const jsonlPath = path.join(ROOT, "data/processed/cannes_lovethework_with_points.jsonl");
  const outPath = path.join(ROOT, "web", "public", "category-stats.json");

  const countLines = fs.readFileSync(countsPath, "utf8").trim().split("\n");
  const header = parseCsvLine(countLines[0]);
  const yi = header.indexOf("year");
  const si = header.indexOf("category_slug");
  const ei = header.indexOf("entries");

  /** @type {Record<string, Record<string, number>>} */
  const entriesByYearSlug = {};
  for (let i = 1; i < countLines.length; i++) {
    const cols = parseCsvLine(countLines[i]);
    const year = String(cols[yi]);
    const slug = cols[si];
    const n = parseInt(cols[ei], 10);
    if (!entriesByYearSlug[year]) entriesByYearSlug[year] = {};
    entriesByYearSlug[year][slug] = n;
  }

  const jl = fs.readFileSync(jsonlPath, "utf8").trim().split("\n");
  /** @type {Record<string, Record<string, { shortlist: number, bronze: number, silver: number, gold: number, grandPrix: number, titaniumLion: number }>>} */
  const agg = {};
  /** @type {Record<string, Record<string, { totalPoints: number, winnerPoints: number }>>} */
  const pointsAgg = {};
  /** Result rows per category-year (LoveThework lines), for subcategory spend pro-rating. */
  /** @type {Record<string, Record<string, number>>} */
  const lineCountByYearSlug = {};
  /** @type {Record<string, Record<string, Record<string, { points: number, lines: number }>>>} */
  const subAgg = {};
  /** Metal win rows (bronze–titanium) per subcategory, from LoveThework winners. */
  /** @type {Record<string, Record<string, Record<string, number>>>} */
  const subMetalAgg = {};
  /** Subcategory labels observed in 2025 per slug. */
  /** @type {Record<string, Set<string>>} */
  const subs2025BySlug = {};
  /** Sum of award points per LoveThework entry URL (for failure-rate: entries with 0 total points). */
  /** @type {Record<string, Record<string, Record<string, number>>>} */
  const pointsByEntryUrl = {};
  /** Points per entry URL within a subcategory (year → slug → sub → url → pts). */
  /** @type {Record<string, Record<string, Record<string, Record<string, number>>>>} */
  const pointsByEntryUrlSub = {};
  /** Bronze / silver / gold / titanium Lion win rows per subcategory. */
  /** @type {Record<string, Record<string, Record<string, { bronze: number, silver: number, gold: number, titaniumLion: number }>>>} */
  const subBsgAgg = {};

  for (const line of jl) {
    const row = JSON.parse(line);
    const year = String(row.year);
    const slug = row.category_slug;
    if (!slug) continue;
    if (!agg[year]) agg[year] = {};
    if (!agg[year][slug]) {
      agg[year][slug] = {
        shortlist: 0,
        bronze: 0,
        silver: 0,
        gold: 0,
        grandPrix: 0,
        titaniumLion: 0,
      };
    }
    if (!pointsAgg[year]) pointsAgg[year] = {};
    if (!pointsAgg[year][slug]) {
      pointsAgg[year][slug] = { totalPoints: 0, winnerPoints: 0 };
    }
    const pts = typeof row.points === "number" ? row.points : 0;
    pointsAgg[year][slug].totalPoints += pts;
    if (row.list_type === "winner") {
      pointsAgg[year][slug].winnerPoints += pts;
    }

    if (!lineCountByYearSlug[year]) lineCountByYearSlug[year] = {};
    lineCountByYearSlug[year][slug] = (lineCountByYearSlug[year][slug] ?? 0) + 1;

    const subKey = typeof row.subcategory === "string" ? row.subcategory.trim() : "";
    if (year === "2025" && subKey) {
      if (!subs2025BySlug[slug]) subs2025BySlug[slug] = new Set();
      subs2025BySlug[slug].add(subKey);
    }
    if (subKey) {
      if (!subAgg[year]) subAgg[year] = {};
      if (!subAgg[year][slug]) subAgg[year][slug] = {};
      if (!subAgg[year][slug][subKey]) {
        subAgg[year][slug][subKey] = { points: 0, lines: 0 };
      }
      subAgg[year][slug][subKey].points += pts;
      subAgg[year][slug][subKey].lines += 1;
    }

    const entryUrl = typeof row.entry_url === "string" ? row.entry_url.trim() : "";
    if (entryUrl) {
      if (!pointsByEntryUrl[year]) pointsByEntryUrl[year] = {};
      if (!pointsByEntryUrl[year][slug]) pointsByEntryUrl[year][slug] = {};
      const u = pointsByEntryUrl[year][slug];
      u[entryUrl] = (u[entryUrl] ?? 0) + pts;
    }
    if (entryUrl && subKey) {
      if (!pointsByEntryUrlSub[year]) pointsByEntryUrlSub[year] = {};
      if (!pointsByEntryUrlSub[year][slug]) pointsByEntryUrlSub[year][slug] = {};
      if (!pointsByEntryUrlSub[year][slug][subKey]) {
        pointsByEntryUrlSub[year][slug][subKey] = {};
      }
      const us = pointsByEntryUrlSub[year][slug][subKey];
      us[entryUrl] = (us[entryUrl] ?? 0) + pts;
    }

    const a = agg[year][slug];
    if (row.list_type === "shortlist") {
      a.shortlist++;
      continue;
    }
    if (row.list_type !== "winner") continue;
    const b = bucketForRule(row.points_rule);
    if (b === "bronze") a.bronze++;
    else if (b === "silver") a.silver++;
    else if (b === "gold") a.gold++;
    else if (b === "grandPrix") a.grandPrix++;
    else if (b === "titaniumLion") a.titaniumLion++;

    if (
      subKey &&
      (b === "bronze" || b === "silver" || b === "gold" || b === "titaniumLion")
    ) {
      if (!subBsgAgg[year]) subBsgAgg[year] = {};
      if (!subBsgAgg[year][slug]) subBsgAgg[year][slug] = {};
      if (!subBsgAgg[year][slug][subKey]) {
        subBsgAgg[year][slug][subKey] = {
          bronze: 0,
          silver: 0,
          gold: 0,
          titaniumLion: 0,
        };
      }
      const o = subBsgAgg[year][slug][subKey];
      if (b === "bronze") o.bronze++;
      else if (b === "silver") o.silver++;
      else if (b === "gold") o.gold++;
      else if (b === "titaniumLion") o.titaniumLion++;
    }

    if (
      subKey &&
      (b === "bronze" ||
        b === "silver" ||
        b === "gold" ||
        b === "grandPrix" ||
        b === "titaniumLion")
    ) {
      if (!subMetalAgg[year]) subMetalAgg[year] = {};
      if (!subMetalAgg[year][slug]) subMetalAgg[year][slug] = {};
      subMetalAgg[year][slug][subKey] =
        (subMetalAgg[year][slug][subKey] ?? 0) + 1;
    }
  }

  /** Hub counts when /results has no table (see cannes_category_results_overrides.json). */
  function estimateWinnerPointsFromBuckets(c) {
    return (
      (c.bronze ?? 0) * 5 +
      (c.silver ?? 0) * 10 +
      (c.gold ?? 0) * 20 +
      (c.grandPrix ?? 0) * 40 +
      (c.titaniumLion ?? 0) * 40
    );
  }

  const overridesPath = path.join(
    ROOT,
    "data/processed/cannes_category_results_overrides.json",
  );
  let hubOverrides = { note: "", bySlug: {} };
  if (fs.existsSync(overridesPath)) {
    hubOverrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
  }
  for (const [slug, yearMap] of Object.entries(hubOverrides.bySlug || {})) {
    for (const [year, buckets] of Object.entries(yearMap)) {
      const merged = {
        shortlist: buckets.shortlists ?? buckets.shortlist ?? 0,
        bronze: buckets.bronze ?? 0,
        silver: buckets.silver ?? 0,
        gold: buckets.gold ?? 0,
        grandPrix: buckets.grandPrix ?? 0,
        titaniumLion: buckets.titaniumLion ?? 0,
      };
      const prev = agg[year]?.[slug];
      const prevMetals = prev
        ? prev.bronze +
          prev.silver +
          prev.gold +
          prev.grandPrix +
          prev.titaniumLion
        : 0;
      if (!prev || (prevMetals === 0 && prev.shortlist === 0)) {
        if (!agg[year]) agg[year] = {};
        agg[year][slug] = merged;
        if (!pointsAgg[year]) pointsAgg[year] = {};
        const winnerPts = estimateWinnerPointsFromBuckets(merged);
        const shortlistPts = merged.shortlist * 1;
        pointsAgg[year][slug] = {
          totalPoints: shortlistPts + winnerPts,
          winnerPoints: winnerPts,
        };
      }
    }
  }

  const years = Object.keys(entriesByYearSlug).sort();
  const allSlugs = new Set();
  for (const y of years) {
    Object.keys(entriesByYearSlug[y]).forEach((s) => allSlugs.add(s));
  }

  const result = {
    generated_at: new Date().toISOString(),
    years: years.map(Number),
    categories: [...allSlugs].sort(),
    byYear: {},
  };

  function pct(part, whole) {
    if (!whole || whole <= 0) return null;
    return Math.round((part / whole) * 1000) / 10;
  }

  for (const year of years) {
    const list = [];
    for (const slug of [...allSlugs].sort()) {
      const entries = entriesByYearSlug[year][slug] ?? 0;
      const counts = agg[year]?.[slug] ?? {
        shortlist: 0,
        bronze: 0,
        silver: 0,
        gold: 0,
        grandPrix: 0,
        titaniumLion: 0,
      };
      const metalPieces =
        counts.bronze +
        counts.silver +
        counts.gold +
        counts.grandPrix +
        counts.titaniumLion;
      list.push({
        slug,
        entries,
        counts: {
          shortlist: counts.shortlist,
          bronze: counts.bronze,
          silver: counts.silver,
          gold: counts.gold,
          grandPrix: counts.grandPrix,
          titaniumLion: counts.titaniumLion,
          metalPieces,
        },
        pct: {
          shortlist: pct(counts.shortlist, entries),
          bronze: pct(counts.bronze, entries),
          silver: pct(counts.silver, entries),
          gold: pct(counts.gold, entries),
          grandPrix: pct(counts.grandPrix, entries),
          titaniumLion: pct(counts.titaniumLion, entries),
          metal: pct(metalPieces, entries),
        },
      });
    }
    result.byYear[year] = list;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);

  const feesPath = path.join(ROOT, "data/processed/cannes_category_entry_fees.json");
  const feeDoc = JSON.parse(fs.readFileSync(feesPath, "utf8"));
  const fees = feeDoc.category_slug_to_fee_eur ?? {};

  function round4(n) {
    if (n == null || Number.isNaN(n)) return null;
    return Math.round(n * 10000) / 10000;
  }

  function round1(n) {
    if (n == null || Number.isNaN(n)) return null;
    return Math.round(n * 10) / 10;
  }

  const detailsOut = {
    generated_at: new Date().toISOString(),
    fee_note:
      "Entry fees use the Cannes Lions 2026 “Fee after 2 April 2026” tier from canneslions.com, applied as a rough cost proxy for every festival year.",
    fee_source: feeDoc.source,
    currency: feeDoc.currency ?? "EUR",
    hub_overrides_note: hubOverrides.note || null,
    bySlug: {},
  };

  for (const slug of [...allSlugs].sort()) {
    const feeEur = fees[slug] ?? null;
    const series = [];
    for (const year of years) {
      const entries = entriesByYearSlug[year][slug] ?? 0;
      const counts = agg[year]?.[slug] ?? {
        shortlist: 0,
        bronze: 0,
        silver: 0,
        gold: 0,
        grandPrix: 0,
        titaniumLion: 0,
      };
      const metalPieces =
        counts.bronze +
        counts.silver +
        counts.gold +
        counts.grandPrix +
        counts.titaniumLion;
      const pa = pointsAgg[year]?.[slug] ?? { totalPoints: 0, winnerPoints: 0 };
      const impliedSpendEur = feeEur != null && entries > 0 ? entries * feeEur : null;
      const eurPerPointAll =
        impliedSpendEur != null && pa.totalPoints > 0
          ? round4(impliedSpendEur / pa.totalPoints)
          : null;
      const eurPerMetal =
        impliedSpendEur != null && metalPieces > 0
          ? round4(impliedSpendEur / metalPieces)
          : null;
      series.push({
        year: Number(year),
        entries,
        shortlists: counts.shortlist,
        bronze: counts.bronze,
        silver: counts.silver,
        gold: counts.gold,
        grandPrix: counts.grandPrix,
        titaniumLion: counts.titaniumLion,
        metals: metalPieces,
        points: pa.totalPoints,
        eurPerPoint: eurPerPointAll,
        eurPerMetal,
      });
    }

    const labels2025 =
      subs2025BySlug[slug] != null
        ? [...subs2025BySlug[slug]].sort((a, b) => a.localeCompare(b, "en"))
        : [];
    /**
     * Pooled avg €/pt per subcategory: same category “success” rate each year
     * (shortlist + metal rows vs published entries, capped at 1) applied to each
     * sub’s share of LoveThework rows, then fee × effective entries summed over years ÷ sum of points.
     */
    /** @type {Record<string, number | null>} */
    const avgEurPerPoint = {};
    for (const sub of labels2025) {
      let numer = 0;
      let denom = 0;
      for (const row of series) {
        const year = String(row.year);
        const entries = row.entries;
        const totalLines = lineCountByYearSlug[year]?.[slug] ?? 0;
        const cell = subAgg[year]?.[slug]?.[sub];
        const pt = cell?.points ?? 0;
        const linesSub = cell?.lines ?? 0;
        if (feeEur == null || entries <= 0 || totalLines <= 0) continue;
        const shortlistMetalRows = row.shortlists + row.metals;
        const successRate = Math.min(1, shortlistMetalRows / entries);
        const lineShare = linesSub / totalLines;
        numer += feeEur * entries * successRate * lineShare;
        denom += pt;
      }
      avgEurPerPoint[sub] = denom > 0 ? round4(numer / denom) : null;
    }

    /** Pooled entries per metal win (sub): same success rate & line share as €/pt; metals = win rows only. */
    /** @type {Record<string, number | null>} */
    const entriesPerMetalBySub = {};
    /** @type {number[]} */
    const epmSubList = [];
    for (const sub of labels2025) {
      let entriesEff = 0;
      let metalsK = 0;
      for (const row of series) {
        const year = String(row.year);
        const entries = row.entries;
        const totalLines = lineCountByYearSlug[year]?.[slug] ?? 0;
        const linesSub = subAgg[year]?.[slug]?.[sub]?.lines ?? 0;
        metalsK += subMetalAgg[year]?.[slug]?.[sub] ?? 0;
        if (entries <= 0 || totalLines <= 0) continue;
        const shortlistMetalRows = row.shortlists + row.metals;
        const successRate = Math.min(1, shortlistMetalRows / entries);
        const lineShare = linesSub / totalLines;
        entriesEff += entries * lineShare * successRate;
      }
      const epm =
        metalsK > 0
          ? Math.round((entriesEff / metalsK) * 1000) / 1000
          : null;
      entriesPerMetalBySub[sub] = epm;
      if (epm != null && Number.isFinite(epm)) epmSubList.push(epm);
    }

    const minSubEpm = epmSubList.length ? Math.min(...epmSubList) : 0;
    const maxSubEpm = epmSubList.length ? Math.max(...epmSubList) : 0;
    const flatSubEpm = maxSubEpm === minSubEpm;

    const eurSubList = labels2025
      .map((s) => avgEurPerPoint[s])
      .filter((v) => v != null && Number.isFinite(v));
    const minSubEur = eurSubList.length ? Math.min(...eurSubList) : 0;
    const maxSubEur = eurSubList.length ? Math.max(...eurSubList) : 0;
    const flatSubEur = maxSubEur === minSubEur;

    /** Higher = submit here first: lower avg €/pt and lower entries/metal win vs other subs. */
    /** @type {Record<string, number | null>} */
    const priorityBySub = {};
    for (const sub of labels2025) {
      const eur = avgEurPerPoint[sub];
      const epm = entriesPerMetalBySub[sub];
      if (
        eur == null ||
        epm == null ||
        !Number.isFinite(eur) ||
        !Number.isFinite(epm)
      ) {
        priorityBySub[sub] = null;
        continue;
      }
      const costInv = flatSubEur
        ? 0.5
        : (maxSubEur - eur) / (maxSubEur - minSubEur);
      const epmInv = flatSubEpm
        ? 0.5
        : (maxSubEpm - epm) / (maxSubEpm - minSubEpm);
      priorityBySub[sub] = Math.round(100 * (0.5 * costInv + 0.5 * epmInv));
    }

    let catPAnySum = 0;
    let catPAnyN = 0;
    for (const y of years) {
      const ent = entriesByYearSlug[y][slug] ?? 0;
      if (ent <= 0) continue;
      const urlMap = pointsByEntryUrl[y]?.[slug];
      const withP = urlMap
        ? Object.values(urlMap).filter((pt) => pt > 0).length
        : 0;
      catPAnySum += withP / ent;
      catPAnyN++;
    }
    const pAnyCat = catPAnyN > 0 ? round4(catPAnySum / catPAnyN) : null;

    let entTotAll = 0;
    let brAll = 0;
    let svAll = 0;
    let gdAll = 0;
    let tiAll = 0;
    for (const y of years) {
      entTotAll += entriesByYearSlug[y][slug] ?? 0;
      const ac = agg[y]?.[slug];
      if (ac) {
        brAll += ac.bronze;
        svAll += ac.silver;
        gdAll += ac.gold;
        tiAll += ac.titaniumLion;
      }
    }
    const pBronzeCat = entTotAll > 0 ? round4(brAll / entTotAll) : null;
    const pSilverCat = entTotAll > 0 ? round4(svAll / entTotAll) : null;
    const pGoldCat = entTotAll > 0 ? round4(gdAll / entTotAll) : null;
    const pTitaniumCat = entTotAll > 0 ? round4(tiAll / entTotAll) : null;

    /** @type {Record<string, { pAtLeastOnePoint: number | null, pBronze: number | null, pSilver: number | null, pGold: number | null, pTitanium: number | null }>} */
    const probBySub = {};
    for (const sub of labels2025) {
      let pAnySum = 0;
      let pAnyN = 0;
      for (const y of years) {
        const ent = entriesByYearSlug[y][slug] ?? 0;
        const totL = lineCountByYearSlug[y]?.[slug] ?? 0;
        if (ent <= 0 || totL <= 0) continue;
        const linesSub = subAgg[y]?.[slug]?.[sub]?.lines ?? 0;
        const estE = ent * (linesSub / totL);
        if (estE <= 0) continue;
        const um = pointsByEntryUrlSub[y]?.[slug]?.[sub];
        const u = um ? Object.values(um).filter((pt) => pt > 0).length : 0;
        pAnySum += u / estE;
        pAnyN++;
      }
      const pAnySub = pAnyN > 0 ? round4(pAnySum / pAnyN) : null;

      let eAlloc = 0;
      let bR = 0;
      let sR = 0;
      let gR = 0;
      let tR = 0;
      for (const y of years) {
        const ent = entriesByYearSlug[y][slug] ?? 0;
        const totL = lineCountByYearSlug[y]?.[slug] ?? 0;
        if (ent <= 0 || totL <= 0) continue;
        const linesSub = subAgg[y]?.[slug]?.[sub]?.lines ?? 0;
        const w = linesSub / totL;
        eAlloc += ent * w;
        const sg = subBsgAgg[y]?.[slug]?.[sub];
        if (sg) {
          bR += sg.bronze;
          sR += sg.silver;
          gR += sg.gold;
          tR += sg.titaniumLion ?? 0;
        }
      }
      probBySub[sub] = {
        pAtLeastOnePoint: pAnySub,
        pBronze: eAlloc > 0 ? round4(bR / eAlloc) : null,
        pSilver: eAlloc > 0 ? round4(sR / eAlloc) : null,
        pGold: eAlloc > 0 ? round4(gR / eAlloc) : null,
        pTitanium: eAlloc > 0 ? round4(tR / eAlloc) : null,
      };
    }

    detailsOut.bySlug[slug] = {
      feeEur,
      series,
      subcategoryCost: {
        labels2025,
        avgEurPerPoint,
        entriesPerMetalBySub,
        priorityBySub,
      },
      probabilities: {
        category: {
          pAtLeastOnePoint: pAnyCat,
          pBronze: pBronzeCat,
          pSilver: pSilverCat,
          pGold: pGoldCat,
          pTitanium: pTitaniumCat,
        },
        bySubcategory: probBySub,
      },
    };
  }

  /** Pooled 2015–2025: entries vs metal win rows; score is min–max across categories (0–100). */
  detailsOut.competitiveness_note =
    "Competitiveness compares categories using pooled festival years: published entry totals divided by metal win rows from The Work (higher = more entries per metal line). Metals are row counts, not unique campaigns—use scores for relative ranking, not literal odds.";
  detailsOut.subcategory_cost_note =
    "Priority (0–100) is higher when average cost (€ spent per point won) and competitiveness (entries per metals won) are both lower relative to other subcategories — favouring subcategories that are easier to score.";

  /** @type {Record<string, { entriesTotal: number, metalsTotal: number, shortlistsTotal: number, pointsTotal: number, nYears: number, entriesPerMetal: number | null }>} */
  const pooled = {};
  for (const slug of Object.keys(detailsOut.bySlug)) {
    const series = detailsOut.bySlug[slug].series;
    let entriesTotal = 0;
    let metalsTotal = 0;
    let shortlistsTotal = 0;
    let pointsTotal = 0;
    const nYears = series.length;
    for (const row of series) {
      entriesTotal += row.entries;
      metalsTotal += row.metals;
      shortlistsTotal += row.shortlists;
      pointsTotal += row.points;
    }
    const entriesPerMetal =
      metalsTotal > 0 ? entriesTotal / metalsTotal : null;
    pooled[slug] = {
      entriesTotal,
      metalsTotal,
      shortlistsTotal,
      pointsTotal,
      nYears,
      entriesPerMetal,
    };
  }

  const epmList = Object.values(pooled)
    .map((p) => p.entriesPerMetal)
    .filter((v) => v != null && Number.isFinite(v));
  const minEpm = epmList.length ? Math.min(...epmList) : 0;
  const maxEpm = epmList.length ? Math.max(...epmList) : 0;
  const flatEpm = maxEpm === minEpm;

  for (const slug of Object.keys(detailsOut.bySlug)) {
    const p = pooled[slug];
    const feeEur = detailsOut.bySlug[slug].feeEur;
    let competitivenessScore = null;
    if (p.entriesPerMetal != null && Number.isFinite(p.entriesPerMetal)) {
      competitivenessScore = flatEpm
        ? 50
        : Math.round(
            (100 * (p.entriesPerMetal - minEpm)) / (maxEpm - minEpm),
          );
    }
    const impliedSpendTotalEur =
      feeEur != null && p.entriesTotal > 0 ? feeEur * p.entriesTotal : null;
    const eurPerPointPooled =
      impliedSpendTotalEur != null && p.pointsTotal > 0
        ? round4(impliedSpendTotalEur / p.pointsTotal)
        : null;
    const ny = p.nYears > 0 ? p.nYears : 1;

    let failurePctSum = 0;
    let failurePctYears = 0;
    for (const y of years) {
      const ent = entriesByYearSlug[y][slug] ?? 0;
      if (ent <= 0) continue;
      const urlMap = pointsByEntryUrl[y]?.[slug] ?? {};
      let withPoints = 0;
      for (const pt of Object.values(urlMap)) {
        if (pt > 0) withPoints++;
      }
      if (withPoints > ent) withPoints = ent;
      const failPct = (100 * (ent - withPoints)) / ent;
      failurePctSum += failPct;
      failurePctYears++;
    }
    const avgFailureRatePct =
      failurePctYears > 0 ? round1(failurePctSum / failurePctYears) : null;

    detailsOut.bySlug[slug].aggregate = {
      entriesTotal: p.entriesTotal,
      metalsTotal: p.metalsTotal,
      shortlistsTotal: p.shortlistsTotal,
      pointsTotal: p.pointsTotal,
      impliedSpendTotalEur,
      eurPerPointPooled,
      avgShortlistsPerYear:
        p.nYears > 0
          ? Math.round((p.shortlistsTotal / ny) * 1000) / 1000
          : null,
      avgMetalsPerYear:
        p.nYears > 0
          ? Math.round((p.metalsTotal / ny) * 1000) / 1000
          : null,
      entriesPerMetal:
        p.entriesPerMetal != null
          ? Math.round(p.entriesPerMetal * 1000) / 1000
          : null,
      competitivenessScore,
      avgFailureRatePct,
    };
  }

  detailsOut.categories = result.categories;

  const detailsPath = path.join(ROOT, "web", "public", "category-details.json");
  fs.writeFileSync(detailsPath, JSON.stringify(detailsOut, null, 2) + "\n", "utf8");
  console.log(`Wrote ${detailsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
