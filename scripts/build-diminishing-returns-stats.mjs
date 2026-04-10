/**
 * Structural metal ceilings per subcategory-year, network aggregates, and
 * Monte Carlo + concave fit for diminishing returns vs entry count.
 *
 * Run: node scripts/build-diminishing-returns-stats.mjs
 * Inputs: data/processed/cannes_lovethework_with_points.jsonl, cannes_category_entry_counts.csv,
 *         web/public/category-details.json (fees)
 * Outputs: data/processed/diminishing_returns.json, diminishing_returns_networks.jsonl,
 *          diminishing_returns_recommendations.csv (per subcategory: recommended max entries)
 *
 * Env: CANNES_EUR_PER_POINT — shadow EUR value of one award point (default 1).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { bucketForRule } from "./lib/award-buckets.mjs";
import { networkKeyFromEntrant } from "./lib/entrant-network.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const MC_TRIALS = 800;
const N_MAX = 20;
const MIN_EST_ENTRIES = 5;
/** Shadow price of one award point in EUR (set CANNES_EUR_PER_POINT). Used for recommended max entries. */
const EUR_PER_POINT = (() => {
  const v = Number(process.env.CANNES_EUR_PER_POINT);
  return Number.isFinite(v) && v > 0 ? v : 1;
})();
/**
 * Heuristic: keep adding entries while marginal E[pts] stays ≥ this fraction of the 1st entry’s marginal (diminishing-returns stop rule without €).
 * Set CANNES_MARGINAL_RELATIVE_FLOOR (default 0.15).
 */
const MARGINAL_REL_FLOOR = (() => {
  const v = Number(process.env.CANNES_MARGINAL_RELATIVE_FLOOR);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.15;
})();
/** Subcategory labels can contain "|"; do not join slug|sub with "|". */
const CELL_KEY_SEP = "\x1F";

/**
 * Largest n such that each additional entry from 1..n has marginal expected points × eurPerPoint ≥ feeEur
 * (stops at first n where the nth entry’s marginal value is below the fee).
 */
function maxEntriesMarginalRule(marginalMeanPoints, feeEur, eurPerPoint) {
  if (feeEur == null || feeEur <= 0 || eurPerPoint == null || eurPerPoint <= 0) {
    return null;
  }
  let maxN = 0;
  for (let i = 0; i < marginalMeanPoints.length; i++) {
    if (marginalMeanPoints[i] * eurPerPoint >= feeEur) maxN = i + 1;
    else break;
  }
  return maxN;
}

/** Integer n in [0, N_MAX] maximizing meanPoints[n-1]*eurPerPoint − n*feeEur (0 = do not enter). */
function optimalNNetProfit(meanPoints, feeEur, eurPerPoint) {
  if (feeEur == null || feeEur <= 0 || eurPerPoint == null || eurPerPoint <= 0) {
    return { n: null, netEur: null };
  }
  let bestN = 0;
  let bestNet = 0;
  for (let i = 0; i < meanPoints.length; i++) {
    const n = i + 1;
    const net = meanPoints[i] * eurPerPoint - n * feeEur;
    if (net > bestNet) {
      bestNet = net;
      bestN = n;
    }
  }
  return {
    n: bestN,
    netEur: Math.round(bestNet * 1000) / 1000,
  };
}

/** Largest n such that marginalMeanPoints[n-1] >= floor * marginalMeanPoints[0] (stops when extra entry’s lift falls below share of first). */
function maxEntriesRelativeToFirstMarginal(marginalMeanPoints, floor) {
  if (!marginalMeanPoints.length) return 0;
  const m0 = marginalMeanPoints[0];
  if (!(m0 > 0)) return 0;
  let maxN = 0;
  for (let i = 0; i < marginalMeanPoints.length; i++) {
    if (marginalMeanPoints[i] >= floor * m0) maxN = i + 1;
    else break;
  }
  return maxN;
}

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

function binomial(n, p) {
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (Math.random() < p) k++;
  }
  return k;
}

function quantile(sortedAsc, q) {
  if (sortedAsc.length === 0) return null;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

function pointsFromMetalDraws({ g, s, b, gp, ti }) {
  return g * 20 + s * 10 + b * 5 + gp * 40 + ti * 40;
}

/**
 * Simulate one draw: independent binomial allocation of each metal type to your n slots,
 * capped so total metals won ≤ n (same piece cannot win twice).
 */
function oneSimDraw(yearRow, n) {
  const {
    bronze: B,
    silver: S,
    gold: G,
    grandPrix: GP,
    titaniumLion: Ti,
    E_est,
  } = yearRow;
  if (!E_est || E_est < 1 || !Number.isFinite(E_est)) return 0;
  const p = Math.min(1, n / E_est);

  let rem = n;
  let g = Math.min(binomial(G, p), rem);
  rem -= g;
  let s = Math.min(binomial(S, p), rem);
  rem -= s;
  let b = Math.min(binomial(B, p), rem);
  rem -= b;
  let gp = Math.min(binomial(GP, p), rem);
  rem -= gp;
  let ti = Math.min(binomial(Ti, p), rem);
  return pointsFromMetalDraws({ g, s, b, gp, ti });
}

function simulateCell(yearsRows, feeEur) {
  const nVals = [];
  const meanPoints = [];
  const marginalMean = [];
  let prevMean = 0;

  for (let n = 1; n <= N_MAX; n++) {
    let sum = 0;
    for (let t = 0; t < MC_TRIALS; t++) {
      const yr = yearsRows[(Math.random() * yearsRows.length) | 0];
      sum += oneSimDraw(yr, n);
    }
    const mean = sum / MC_TRIALS;
    nVals.push(n);
    meanPoints.push(Math.round(mean * 1000) / 1000);
    marginalMean.push(Math.round((mean - prevMean) * 1000) / 1000);
    prevMean = mean;
  }

  const marginalEurPerPoint =
    feeEur != null && feeEur > 0
      ? marginalMean.map((m) =>
          m > 0 ? Math.round((feeEur / m) * 10000) / 10000 : null,
        )
      : null;

  return {
    n: nVals,
    meanPoints,
    marginalMeanPoints: marginalMean,
    marginalEurPerPointIfOneEuroPerPoint: marginalEurPerPoint,
    note: "Mean points from Monte Carlo: sample a festival year uniformly, allocate each metal count via Binomial(total_k, min(1,n/E_est)), capped so metals won ≤ n entries; GP/Titanium included.",
  };
}

function fitConcave(nVals, yVals) {
  const maxY = Math.max(...yVals, 1e-6);
  let best = { sse: Infinity, S_max: maxY, alpha: 0.05 };
  for (let S_max = maxY * 0.5; S_max <= maxY * 3; S_max += maxY * 0.05) {
    for (let a = 0.01; a < 3; a += 0.01) {
      let sse = 0;
      for (let i = 0; i < nVals.length; i++) {
        const pred = S_max * (1 - Math.exp(-a * nVals[i]));
        sse += (pred - yVals[i]) ** 2;
      }
      if (sse < best.sse) best = { sse, S_max, alpha: a };
    }
  }
  return {
    S_max_points: Math.round(best.S_max * 1000) / 1000,
    alpha: Math.round(best.alpha * 10000) / 10000,
    sse: Math.round(best.sse * 1000) / 1000,
    formula: "S_max * (1 - exp(-alpha * n)) fitted to simulated meanPoints(n) by grid search",
  };
}

function main() {
  const jsonlPath = path.join(ROOT, "data/processed/cannes_lovethework_with_points.jsonl");
  const countsPath = path.join(ROOT, "data/processed/cannes_category_entry_counts.csv");
  const detailsPath = path.join(ROOT, "web/public/category-details.json");
  const outJson = path.join(ROOT, "data/processed/diminishing_returns.json");
  const outNetJsonl = path.join(ROOT, "data/processed/diminishing_returns_networks.jsonl");
  const outRecCsv = path.join(ROOT, "data/processed/diminishing_returns_recommendations.csv");

  const jl = fs.readFileSync(jsonlPath, "utf8").trim().split("\n");

  /** @type {Record<string, Record<string, Record<string, number>>>} */
  const lineCountSub = {};
  /** @type {Record<string, Record<string, Record<string, { bronze: number, silver: number, gold: number, grandPrix: number, titaniumLion: number, pointsSum: number, metalRows: number }>>>} */
  const cap = {};
  /** @type {Record<string, Record<string, Record<string, Record<string, { bronze: number, silver: number, gold: number, points: number, rows: number }>>>>} */
  const net = {};

  for (const line of jl) {
    const row = JSON.parse(line);
    const year = String(row.year);
    const slug = row.category_slug;
    if (!slug) continue;
    const subKey = typeof row.subcategory === "string" ? row.subcategory.trim() : "";
    if (!subKey) continue;

    if (!lineCountSub[year]) lineCountSub[year] = {};
    if (!lineCountSub[year][slug]) lineCountSub[year][slug] = {};
    lineCountSub[year][slug][subKey] =
      (lineCountSub[year][slug][subKey] ?? 0) + 1;

    if (row.list_type !== "winner") continue;

    const b = bucketForRule(row.points_rule);
    if (!b) continue;

    if (!cap[year]) cap[year] = {};
    if (!cap[year][slug]) cap[year][slug] = {};
    if (!cap[year][slug][subKey]) {
      cap[year][slug][subKey] = {
        bronze: 0,
        silver: 0,
        gold: 0,
        grandPrix: 0,
        titaniumLion: 0,
        pointsSum: 0,
        metalRows: 0,
      };
    }
    const c = cap[year][slug][subKey];
    const pts = typeof row.points === "number" ? row.points : 0;
    c.pointsSum += pts;
    if (
      b === "bronze" ||
      b === "silver" ||
      b === "gold" ||
      b === "grandPrix" ||
      b === "titaniumLion"
    ) {
      c.metalRows++;
    }
    if (b === "bronze") c.bronze++;
    else if (b === "silver") c.silver++;
    else if (b === "gold") c.gold++;
    else if (b === "grandPrix") c.grandPrix++;
    else if (b === "titaniumLion") c.titaniumLion++;

    const nk = networkKeyFromEntrant(row.entrant);
    if (!net[year]) net[year] = {};
    if (!net[year][slug]) net[year][slug] = {};
    if (!net[year][slug][subKey]) net[year][slug][subKey] = {};
    if (!net[year][slug][subKey][nk]) {
      net[year][slug][subKey][nk] = {
        bronze: 0,
        silver: 0,
        gold: 0,
        points: 0,
        rows: 0,
      };
    }
    const nc = net[year][slug][subKey][nk];
    nc.rows++;
    nc.points += pts;
    if (b === "bronze") nc.bronze++;
    else if (b === "silver") nc.silver++;
    else if (b === "gold") nc.gold++;
  }

  const countLines = fs.readFileSync(countsPath, "utf8").trim().split("\n");
  const header = parseCsvLine(countLines[0]);
  const yi = header.indexOf("year");
  const si = header.indexOf("category_slug");
  const ei = header.indexOf("entries");
  /** @type {Record<string, Record<string, number>>} */
  const entriesByYearSlug = {};
  for (let i = 1; i < countLines.length; i++) {
    const cols = parseCsvLine(countLines[i]);
    const y = String(cols[yi]);
    const sl = cols[si];
    const n = parseInt(cols[ei], 10);
    if (!entriesByYearSlug[y]) entriesByYearSlug[y] = {};
    entriesByYearSlug[y][sl] = n;
  }

  const details = JSON.parse(fs.readFileSync(detailsPath, "utf8"));

  /** @param {string} year @param {string} slug @param {string} sub */
  function estEntries(year, slug, sub) {
    const ent = entriesByYearSlug[year]?.[slug];
    const totL = Object.values(lineCountSub[year]?.[slug] ?? {}).reduce(
      (a, x) => a + x,
      0,
    );
    const linesSub = lineCountSub[year]?.[slug]?.[sub] ?? 0;
    if (!ent || ent <= 0 || totL <= 0) return 0;
    return ent * (linesSub / totL);
  }

  const structuralCaps = [];
  for (const year of Object.keys(cap).sort()) {
    for (const slug of Object.keys(cap[year]).sort()) {
      for (const sub of Object.keys(cap[year][slug]).sort()) {
        const c = cap[year][slug][sub];
        const E_est = estEntries(year, slug, sub);
        structuralCaps.push({
          year: Number(year),
          category_slug: slug,
          subcategory: sub,
          bronze: c.bronze,
          silver: c.silver,
          gold: c.gold,
          grandPrix: c.grandPrix,
          titaniumLion: c.titaniumLion,
          metalWinRows: c.metalRows,
          pointsSumWinners: Math.round(c.pointsSum * 1000) / 1000,
          pointsCeiling: c.pointsSum,
          estEntriesInSubcategory: Math.round(E_est * 1000) / 1000,
        });
      }
    }
  }

  const goldCounts = [];
  const networkJsonl = [];
  for (const year of Object.keys(net).sort()) {
    for (const slug of Object.keys(net[year]).sort()) {
      for (const sub of Object.keys(net[year][slug]).sort()) {
        for (const nk of Object.keys(net[year][slug][sub])) {
          const o = net[year][slug][sub][nk];
          goldCounts.push(o.gold);
          networkJsonl.push(
            JSON.stringify({
              year: Number(year),
              category_slug: slug,
              subcategory: sub,
              network: nk,
              bronze: o.bronze,
              silver: o.silver,
              gold: o.gold,
              points: Math.round(o.points * 1000) / 1000,
              winnerRows: o.rows,
            }),
          );
        }
      }
    }
  }
  fs.writeFileSync(outNetJsonl, networkJsonl.join("\n") + "\n", "utf8");

  const goldSorted = goldCounts.filter((g) => g > 0).sort((a, b) => a - b);
  const networkGoldQuantiles = {
    overWinningCellsWithGold_gt0: {
      n: goldSorted.length,
      p50: quantile(goldSorted, 0.5),
      p90: quantile(goldSorted, 0.9),
      p95: quantile(goldSorted, 0.95),
      p99: quantile(goldSorted, 0.99),
      max: goldSorted.length ? goldSorted[goldSorted.length - 1] : null,
    },
  };

  /** @type {Record<string, { year: string, gold: number, slug: string, sub: string, network: string }[]>} */
  const maxGoldByCell = {};
  for (const year of Object.keys(net)) {
    for (const slug of Object.keys(net[year])) {
      for (const sub of Object.keys(net[year][slug])) {
        const key = `${slug}${CELL_KEY_SEP}${sub}`;
        for (const nk of Object.keys(net[year][slug][sub])) {
          const g = net[year][slug][sub][nk].gold;
          if (!maxGoldByCell[key]) maxGoldByCell[key] = [];
          maxGoldByCell[key].push({
            year,
            slug,
            sub,
            network: nk,
            gold: g,
          });
        }
      }
    }
  }
  const perCellMaxGold = [];
  for (const key of Object.keys(maxGoldByCell)) {
    const arr = maxGoldByCell[key];
    const top = arr.reduce((a, b) => (a.gold >= b.gold ? a : b));
    perCellMaxGold.push({
      category_slug: top.slug,
      subcategory: top.sub,
      maxGoldBySingleNetworkInOneYear: top.gold,
      year: Number(top.year),
      network: top.network,
    });
  }
  perCellMaxGold.sort(
    (a, b) => b.maxGoldBySingleNetworkInOneYear - a.maxGoldBySingleNetworkInOneYear,
  );

  /** Build simulation index: slug\x1Fsub -> year rows */
  /** @type {Record<string, Array<{ year: number, bronze: number, silver: number, gold: number, grandPrix: number, titaniumLion: number, E_est: number, pointsTotal: number }>>} */
  const byCell = {};
  for (const sc of structuralCaps) {
    const key = `${sc.category_slug}${CELL_KEY_SEP}${sc.subcategory}`;
    if (!byCell[key]) byCell[key] = [];
    byCell[key].push({
      year: sc.year,
      bronze: sc.bronze,
      silver: sc.silver,
      gold: sc.gold,
      grandPrix: sc.grandPrix,
      titaniumLion: sc.titaniumLion,
      E_est: sc.estEntriesInSubcategory,
      pointsTotal: sc.pointsSumWinners,
    });
  }

  const simulationByCell = {};
  const concaveByCell = {};
  /** @type {string[]} */
  const recCsvLines = [
    [
      "category_slug",
      "subcategory",
      "fee_eur",
      "eur_per_point",
      "max_entries_marginal_rule",
      "optimal_n_net_profit",
      "expected_net_profit_eur_at_optimal_n",
      "implied_breakeven_eur_per_point_first_entry",
      "max_entries_relative_marginal_floor",
      "marginal_relative_floor",
      "structural_ceiling_metal_rows",
      "festival_years_sampled",
    ].join(","),
  ];
  let simulatedCells = 0;
  for (const key of Object.keys(byCell)) {
    const rows = byCell[key].filter((r) => r.E_est >= MIN_EST_ENTRIES);
    const metals = rows.reduce(
      (a, r) => a + r.bronze + r.silver + r.gold + r.grandPrix + r.titaniumLion,
      0,
    );
    if (rows.length < 1 || metals < 1) continue;

    const sep = key.indexOf(CELL_KEY_SEP);
    const slug = sep >= 0 ? key.slice(0, sep) : key;
    const sub = sep >= 0 ? key.slice(sep + 1) : "";
    const feeEur = details.bySlug?.[slug]?.feeEur ?? null;
    const sim = simulateCell(rows, feeEur);
    const metalRowsMaxYear = Math.max(
      0,
      ...rows.map(
        (r) =>
          r.bronze + r.silver + r.gold + r.grandPrix + r.titaniumLion,
      ),
    );
    const maxNmarg = maxEntriesMarginalRule(
      sim.marginalMeanPoints,
      feeEur,
      EUR_PER_POINT,
    );
    const netOpt = optimalNNetProfit(sim.meanPoints, feeEur, EUR_PER_POINT);
    const m0 = sim.marginalMeanPoints[0];
    const impliedBreakEvenEurPerPointFirstEntry =
      feeEur != null &&
      feeEur > 0 &&
      m0 != null &&
      m0 > 0
        ? Math.round((feeEur / m0) * 10000) / 10000
        : null;
    const maxRel = maxEntriesRelativeToFirstMarginal(
      sim.marginalMeanPoints,
      MARGINAL_REL_FLOOR,
    );
    simulationByCell[key] = {
      category_slug: slug,
      subcategory: sub,
      festivalYearsSampled: rows.length,
      meanEstEntries:
        Math.round(
          (rows.reduce((a, r) => a + r.E_est, 0) / rows.length) * 1000,
        ) / 1000,
      feeEur,
      recommendation: {
        eurPerPoint: EUR_PER_POINT,
        maxEntriesMarginalRule: maxNmarg,
        optimalNNetProfit: netOpt.n,
        expectedNetProfitEurAtOptimalN: netOpt.netEur,
        impliedBreakEvenEurPerPointFirstEntry,
        maxEntriesRelativeMarginalFloor: maxRel,
        marginalRelativeFloor: MARGINAL_REL_FLOOR,
        structuralCeilingEntries:
          metalRowsMaxYear > 0 ? metalRowsMaxYear : null,
        note:
          "maxEntriesMarginalRule: largest n such that marginalMeanPoints[k-1]*eurPerPoint >= fee for k=1..n. maxEntriesRelativeMarginalFloor: largest n with marginal ≥ floor×first marginal (CANNES_MARGINAL_RELATIVE_FLOOR). optimalNNetProfit: n maximizing simulated E[points]*eurPerPoint - n*fee. impliedBreakEvenEurPerPointFirstEntry = fee/marginalMeanPoints[0]. structuralCeilingEntries: max metal win rows in any sampled year. Set CANNES_EUR_PER_POINT for fee-based caps (often >> 1).",
      },
      ...sim,
    };
    concaveByCell[key] = fitConcave(sim.n, sim.meanPoints);
    const rec = simulationByCell[key].recommendation;
    const esc = (s) =>
      `"${String(s ?? "").replace(/"/g, '""')}"`;
    recCsvLines.push(
      [
        slug,
        esc(sub),
        feeEur ?? "",
        EUR_PER_POINT,
        rec.maxEntriesMarginalRule ?? "",
        rec.optimalNNetProfit ?? "",
        rec.expectedNetProfitEurAtOptimalN ?? "",
        rec.impliedBreakEvenEurPerPointFirstEntry ?? "",
        rec.maxEntriesRelativeMarginalFloor ?? "",
        rec.marginalRelativeFloor ?? "",
        rec.structuralCeilingEntries ?? "",
        rows.length,
      ].join(","),
    );
    simulatedCells++;
  }

  const out = {
    generated_at: new Date().toISOString(),
    source_jsonl: "data/processed/cannes_lovethework_with_points.jsonl",
    networks_jsonl: "data/processed/diminishing_returns_networks.jsonl",
    recommendations_csv: "data/processed/diminishing_returns_recommendations.csv",
    notes: {
      structural:
        "Per festival year and subcategory: counts of winner rows by metal bucket from LoveThework; pointsCeiling equals sum of row points (same scheme as award-points.mjs). Any entrant can win at most gold metal rows in that cell that year (≤ gold count).",
      estEntries:
        "estEntriesInSubcategory matches build-category-stats: category entry count × (LoveThework lines in this sub / all lines in category for that year).",
      network:
        "network is the first segment of `entrant` before ' / ' (see entrant-network.mjs).",
      simulation:
        "Monte Carlo samples a year uniformly, draws metals via independent binomials with p = min(1, n/E_est), caps so total metals ≤ n. Concave fit minimizes SSE of S_max*(1-exp(-alpha*n)) to simulated mean points.",
      marginal_eur:
        "marginalEurPerPointIfOneEuroPerPoint = feeEur / marginalMeanPoints (lower is better); interpret when you value 1 point ≈ 1 EUR.",
      recommendations:
        "Per simulated subcategory: recommendation.maxEntriesMarginalRule is the max n where the expected marginal points from the nth entry (from MC) times eurPerPoint still covers the category entry fee. Set CANNES_EUR_PER_POINT to your shadow price of one ranking point in EUR. optimalNNetProfit maximizes expected net EUR (same simulation). structuralCeilingEntries is a hard cap from festival history (metal rows in that cell-year).",
    },
    parameters: {
      mcTrials: MC_TRIALS,
      nMax: N_MAX,
      minEstEntriesForSimulation: MIN_EST_ENTRIES,
      eurPerPoint: EUR_PER_POINT,
      marginalRelativeFloor: MARGINAL_REL_FLOOR,
    },
    networkGoldQuantiles,
    topCellsByMaxGoldPerNetworkYear: perCellMaxGold.slice(0, 50),
    structuralCaps,
    simulationByCell,
    concaveFitByCell: concaveByCell,
    summary: {
      structuralCapRows: structuralCaps.length,
      networkAggRows: networkJsonl.length,
      simulatedSubcategoryCells: simulatedCells,
    },
  };

  fs.writeFileSync(outJson, JSON.stringify(out, null, 2), "utf8");
  fs.writeFileSync(outRecCsv, recCsvLines.join("\n") + "\n", "utf8");
  console.log(
    `Wrote ${structuralCaps.length} structural caps, ${networkJsonl.length} network rows, ${simulatedCells} simulated cells → ${outJson}`,
  );
  console.log(`Wrote ${simulatedCells} recommendation rows → ${outRecCsv}`);
}

main();
