import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { segmentStyle, TITANIUM_CATEGORY_SLUG, type AwardSegmentKey } from "../lib/awardSegments";
import { slugToLabel } from "../lib/labels";
import { CategoryNavChips } from "../CategoryNavChips";
import { SiteBrandIntro } from "../SiteBrandIntro";
import { SiteFooter } from "../SiteFooter";
import type {
  CategoryDetailsPayload,
  CategoryProbabilities,
  CategoryYearSeriesRow,
  ProbabilityRates,
} from "../types";

function formatMoneyPer(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `€${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatCountPerYear(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function formatPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

/** P(at least one success in n independent tries) = 1 − (1 − p)ⁿ */
function probAtLeastOneOfN(p: number | null | undefined, n: number): number | null {
  if (p == null || Number.isNaN(p)) return null;
  const x = Math.max(0, Math.min(1, p));
  if (x <= 0) return 0;
  return 1 - (1 - x) ** n;
}

function formatProbPct(p: number | null | undefined) {
  if (p == null || Number.isNaN(p)) return "—";
  return `${(p * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

/** Extra probability from adding the n-th independent piece: F(n) − F(n−1) with F(n) = 1 − (1−p)ⁿ */
function marginalProbGain(p: number | null | undefined, n: number): number | null {
  if (p == null || Number.isNaN(p) || n < 1) return null;
  if (n === 1) return probAtLeastOneOfN(p, 1);
  const cur = probAtLeastOneOfN(p, n);
  const prev = probAtLeastOneOfN(p, n - 1);
  if (cur == null || prev == null) return null;
  return cur - prev;
}

/** Rows shown in diminished-returns tables (cumulative / marginal at each n). */
const DIMINISHED_RETURNS_N = [1, 5, 10, 15, 20] as const;

/** Upper bound for “max concurrent” recommendation (same independence model). */
const MARGINAL_CAP_N_MAX = 20;

/**
 * Largest n ∈ [1, MARGINAL_CAP_N_MAX] such that the marginal gain on P(≥1 point) from the nth piece is still ≥ floor.
 * Below this (absolute probability) an extra concurrent entry is treated as not cost-effective vs the fee.
 * If even the first piece is below the floor, returns 1 as a conservative minimum.
 */
const MARGINAL_CAP_FLOOR = 0.1;

function recommendedMaxConcurrentPiecesFromRate(p: number | null | undefined): number | null {
  if (p == null || Number.isNaN(p) || p <= 0) return null;
  let maxN = 0;
  for (let n = 1; n <= MARGINAL_CAP_N_MAX; n++) {
    const mar = marginalProbGain(p, n);
    if (mar == null) break;
    if (mar < MARGINAL_CAP_FLOOR) break;
    maxN = n;
  }
  if (maxN === 0) return 1;
  return maxN;
}

function StatCard({
  label,
  value,
  sublabel,
  variant = "light",
  className = "",
}: {
  label: string;
  value: string;
  sublabel?: string;
  variant?: "dark" | "light";
  className?: string;
}) {
  const isDark = variant === "dark";
  return (
    <div
      className={`rounded-xl p-4 shadow-sm ${
        isDark
          ? "border border-white/15 bg-black text-white"
          : "border border-[var(--color-cannes-line)] bg-white"
      } ${className}`}
    >
      <p
        className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${
          isDark ? "text-white/65" : "text-[var(--color-cannes-muted)]"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-2 font-[family-name:var(--font-display)] text-2xl tabular-nums tracking-tight ${
          isDark ? "text-white" : "text-[var(--color-cannes-ink)]"
        }`}
      >
        {value}
      </p>
      {sublabel ? (
        <p
          className={`mt-2 text-xs leading-snug ${isDark ? "text-white/55" : "text-[var(--color-cannes-muted)]"}`}
        >
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}

export default function CategoryDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<CategoryDetailsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/category-details.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load details (${r.status})`);
        return r.json() as Promise<CategoryDetailsPayload>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const detail = slug ? data?.bySlug[slug] : undefined;
  const series: CategoryYearSeriesRow[] = detail?.series ?? [];
  const seriesTableRows = useMemo(
    () => series.filter((r) => r.entries > 0),
    [series],
  );
  const availableSlugSet = useMemo(() => new Set(data?.categories ?? []), [data]);

  if (error) {
    return (
      <div className="min-h-screen pb-20">
        <header>
          <div className="mx-auto max-w-5xl px-4 py-10">
            <SiteBrandIntro />
            <Link
              to="/"
              className="mt-8 inline-block text-sm font-medium text-[var(--color-cannes-muted)] transition hover:text-[var(--color-cannes-ink)]"
            >
              ← All categories
            </Link>
            <p className="mt-6 text-sm text-red-700">{error}</p>
          </div>
        </header>
        <SiteFooter narrow />
      </div>
    );
  }

  if (!data || !slug) {
    return (
      <div className="min-h-screen pb-20">
        <header>
          <div className="mx-auto max-w-5xl px-4 py-10">
            <SiteBrandIntro />
            <CategoryNavChips
              className="mt-6"
              availableSlugs={availableSlugSet}
              activeSlug={slug}
            />
            <Link
              to="/"
              className="mt-8 inline-block text-sm font-medium text-[var(--color-cannes-muted)] transition hover:text-[var(--color-cannes-ink)]"
            >
              ← All categories
            </Link>
            <p className="mt-6 text-sm text-[var(--color-cannes-muted)]">Loading…</p>
          </div>
        </header>
        <SiteFooter narrow />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen pb-20">
        <header>
          <div className="mx-auto max-w-5xl px-4 py-10">
            <SiteBrandIntro />
            <CategoryNavChips
              className="mt-6"
              availableSlugs={availableSlugSet}
              activeSlug={slug}
            />
            <Link
              to="/"
              className="mt-8 inline-block text-sm font-medium text-[var(--color-cannes-muted)] transition hover:text-[var(--color-cannes-ink)]"
            >
              ← All categories
            </Link>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-normal tracking-tight text-[var(--color-cannes-ink)]">
              Unknown category
            </h1>
            <p className="mt-4 text-sm text-[var(--color-cannes-muted)]">
              That slug is not in the dataset.
            </p>
          </div>
        </header>
        <SiteFooter narrow />
      </div>
    );
  }

  const title = slugToLabel(slug);
  const isTitaniumCategory = slug === TITANIUM_CATEGORY_SLUG;
  const agg = detail.aggregate;
  const nYears = Math.max(1, series.length);
  const avgEntriesPerYear = agg ? agg.entriesTotal / nYears : null;

  return (
    <div className="min-h-screen pb-20">
      <header>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <SiteBrandIntro />
          <CategoryNavChips
            className="mt-6"
            availableSlugs={availableSlugSet}
            activeSlug={slug}
          />
          <Link
            to="/"
            className="mt-8 inline-block text-sm font-medium text-[var(--color-cannes-muted)] transition hover:text-[var(--color-cannes-ink)]"
          >
            ← All categories
          </Link>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-normal tracking-tight text-[var(--color-cannes-ink)]">
            {title}
          </h1>
          {agg ? (
            <>
              <div className="mt-8 flex flex-col gap-3">
                <div className="flex w-full min-w-0 flex-nowrap gap-3">
                  <StatCard
                    variant="dark"
                    className="min-w-0 flex-1"
                    label="Avg. entries per year"
                    value={formatCountPerYear(avgEntriesPerYear)}
                  />
                  <StatCard
                    variant="dark"
                    className="min-w-0 flex-1"
                    label="Avg. shortlists per year"
                    value={formatCountPerYear(agg.avgShortlistsPerYear)}
                  />
                  <StatCard
                    variant="dark"
                    className="min-w-0 flex-1"
                    label="Avg. metal wins per year"
                    value={formatCountPerYear(agg.avgMetalsPerYear)}
                  />
                </div>
                <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row">
                  <StatCard
                    variant="light"
                    className="min-w-0 flex-1"
                    label="Failure Rate"
                    value={formatPct(agg.avgFailureRatePct)}
                    sublabel="Avg. % of entries that score 0 points"
                  />
                  <StatCard
                    variant="light"
                    className="min-w-0 flex-1"
                    label="Competitiveness"
                    value={agg.competitivenessScore != null ? `${agg.competitivenessScore}/100` : "—"}
                    sublabel={
                      agg.entriesPerMetal != null
                        ? `Avg. ${agg.entriesPerMetal.toLocaleString("en-US", { maximumFractionDigits: 1 })} entries per metal win`
                        : undefined
                    }
                  />
                  <StatCard
                    variant="light"
                    className="min-w-0 flex-1"
                    label="Cost per point"
                    value={formatMoneyPer(agg.eurPerPointPooled)}
                    sublabel="Avg. € per point awarded"
                  />
                </div>
              </div>
            </>
          ) : null}
          {data.hub_overrides_note && slug === "creative-data" ? (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--color-cannes-muted)]">
              {data.hub_overrides_note}
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-12 px-4 pt-10">
        <section className="space-y-6" aria-labelledby="entries-heading">
          <h2
            id="entries-heading"
            className="font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-[var(--color-cannes-ink)]"
          >
            Entries
          </h2>

          <div>
            <h3
              id="chart-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-cannes-muted)]"
            >
              Entries by year
            </h3>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-cannes-line)] bg-white/90 p-6 sm:p-8">
              <EntriesChart series={series} isTitaniumCategory={isTitaniumCategory} />
              <EntriesChartLegend isTitaniumCategory={isTitaniumCategory} />
            </div>
          </div>

          <div>
            <h3
              id="table-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-cannes-muted)]"
            >
              Year-by-year breakdown
            </h3>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-cannes-line)] bg-white/90">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-cannes-line)] bg-stone-50/80">
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-[var(--color-cannes-ink)]">Year</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-[var(--color-cannes-ink)]">Entries</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-[var(--color-cannes-ink)]">Shortlists</th>
                    {isTitaniumCategory ? (
                      <th className="whitespace-nowrap px-3 py-3 font-medium text-[var(--color-cannes-ink)]">Titanium</th>
                    ) : null}
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-[var(--color-cannes-ink)]">Metals</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-[var(--color-cannes-ink)]">Points</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-[var(--color-cannes-ink)]">€/Pt</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-[var(--color-cannes-ink)]">€/Metal</th>
                  </tr>
                </thead>
                <tbody>
                  {seriesTableRows.map((row: CategoryYearSeriesRow) => (
                    <tr
                      key={row.year}
                      className="border-b border-[var(--color-cannes-line)] last:border-0 hover:bg-stone-50/50"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums font-medium">{row.year}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{row.entries.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{row.shortlists.toLocaleString()}</td>
                      {isTitaniumCategory ? (
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{row.titaniumLion.toLocaleString()}</td>
                      ) : null}
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{row.metals.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{row.points.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatMoneyPer(row.eurPerPoint)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatMoneyPer(row.eurPerMetal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-6" aria-labelledby="cost-heading">
          <h2
            id="cost-heading"
            className="font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-[var(--color-cannes-ink)]"
          >
            Cost
          </h2>

          <div>
            <h3
              id="cost-per-point-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-cannes-muted)]"
            >
              Cost per Point
            </h3>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-cannes-line)] bg-white/90 p-6 sm:p-8">
              <CostPerPointLineChart series={series} />
            </div>
          </div>

          <div>
            <h3
              id="breakdown-by-subcategory-cost-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-cannes-muted)]"
            >
              Breakdown by Sub-Category
            </h3>
            {data.subcategory_cost_note ? (
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--color-cannes-muted)]">
                {data.subcategory_cost_note}
              </p>
            ) : null}
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-cannes-line)] bg-white/90">
              <SubcategoryCostTable
                labels2025={detail.subcategoryCost?.labels2025 ?? []}
                avgEurPerPoint={detail.subcategoryCost?.avgEurPerPoint ?? {}}
                entriesPerMetalBySub={detail.subcategoryCost?.entriesPerMetalBySub ?? {}}
                priorityBySub={detail.subcategoryCost?.priorityBySub ?? {}}
              />
            </div>
          </div>
        </section>

        <section className="space-y-6" aria-labelledby="probabilities-heading">
          <h2
            id="probabilities-heading"
            className="font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-[var(--color-cannes-ink)]"
          >
            Probabilities
          </h2>

          <div>
            <h3
              id="prob-category-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-cannes-muted)]"
            >
              Chances of Scoring
            </h3>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-cannes-line)] bg-white/90 p-6 sm:p-8">
              <CategoryProbabilityChart rates={detail.probabilities?.category} titaniumOnly={isTitaniumCategory} />
            </div>
          </div>

          <div>
            <h3
              id="breakdown-by-subcategory-probability-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-cannes-muted)]"
            >
              Breakdown by Sub-Category
            </h3>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-cannes-line)] bg-white/90">
              <SubcategoryProbabilityTable
                labels2025={detail.subcategoryCost?.labels2025 ?? []}
                bySub={detail.probabilities?.bySubcategory ?? {}}
                titaniumOnly={isTitaniumCategory}
              />
            </div>
          </div>
        </section>

        <section className="space-y-6" aria-labelledby="diminished-returns-heading">
          <h2
            id="diminished-returns-heading"
            className="font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-[var(--color-cannes-ink)]"
          >
            Diminished returns
          </h2>

          <div className="space-y-3" aria-labelledby="marginal-gains-heading">
            <h3
              id="marginal-gains-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-cannes-muted)]"
            >
              Marginal Gains
            </h3>
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-[var(--color-cannes-muted)]">
              <p>
                Concurrent Cannes entries from the same side of the fence do not behave like fully independent lottery tickets: they{" "}
                <strong className="font-medium text-[var(--color-cannes-ink)]">compete for jury attention</strong> in review and discussion.
                At the same time,{" "}
                <strong className="font-medium text-[var(--color-cannes-ink)]">metal wins are scarce</strong>—shortlists and Lions are
                limited each year—so there is a hard ceiling on how much recognition the festival can hand out in a category.
              </p>
              <p>
                Together, that means there is a <strong className="font-medium text-[var(--color-cannes-ink)]">practical limit</strong> to
                how many points a single push can convert into scored work, no matter how many parallel entries you field: each extra piece
                adds a <strong className="font-medium text-[var(--color-cannes-ink)]">smaller marginal gain</strong> toward points
                {isTitaniumCategory ? " and Titanium Lions" : " and metals"},
                which is why the table below focuses on those diminishing steps—and why we cap concurrent submissions further down.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--color-cannes-line)] bg-white/90">
            <DiminishedReturnsTable rates={detail.probabilities?.category} titaniumOnly={isTitaniumCategory} />
          </div>

          <div className="space-y-6" aria-labelledby="max-concurrent-submissions-heading">
            <div>
              <h3
                id="max-concurrent-submissions-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-cannes-muted)]"
              >
                Max Concurrent Submissions
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-cannes-muted)]">
                {isTitaniumCategory ? (
                  <>
                    Using each sub-category’s historical <strong className="font-medium text-[var(--color-cannes-ink)]">Titanium Lion</strong>{" "}
                    rate as <em>p</em>, we recommend the largest number of concurrent entries <em>n</em> ∈ [1, {MARGINAL_CAP_N_MAX}] such that
                    the <strong className="font-medium text-[var(--color-cannes-ink)]">marginal</strong> gain on P(at least one Titanium Lion)
                    from the <em>n</em>th piece is still at least {(MARGINAL_CAP_FLOOR * 100).toLocaleString("en-US")} percentage points—below
                    that, another submission is unlikely to be{" "}
                    <strong className="font-medium text-[var(--color-cannes-ink)]">cost-effective</strong> versus the fee.
                  </>
                ) : (
                  <>
                    Using each sub-category’s historical <strong className="font-medium text-[var(--color-cannes-ink)]">≥1 point</strong> rate as{" "}
                    <em>p</em>, we recommend the largest number of concurrent entries <em>n</em> ∈ [1, {MARGINAL_CAP_N_MAX}] such that the{" "}
                    <strong className="font-medium text-[var(--color-cannes-ink)]">marginal</strong> gain on P(≥1 point) from the{" "}
                    <em>n</em>th piece is still at least {(MARGINAL_CAP_FLOOR * 100).toLocaleString("en-US")} percentage points—below that, another
                    submission is unlikely to be <strong className="font-medium text-[var(--color-cannes-ink)]">cost-effective</strong> versus the
                    fee.
                  </>
                )}
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--color-cannes-line)] bg-white/90">
              <MaxConcurrentSubmissionsSummaryTable
                labels2025={detail.subcategoryCost?.labels2025 ?? []}
                bySub={detail.probabilities?.bySubcategory ?? {}}
                titaniumOnly={isTitaniumCategory}
              />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter narrow />
    </div>
  );
}

function CostPerPointLineChart({ series }: { series: CategoryYearSeriesRow[] }) {
  const layout = useMemo(() => {
    const n = series.length;
    if (n === 0) return null;
    const vals = series
      .map((r) => r.eurPerPoint)
      .filter((v): v is number => v != null && !Number.isNaN(v));
    if (vals.length === 0) return null;

    const w = 800;
    const h = 260;
    const padL = 56;
    const padR = 24;
    const padT = 16;
    const padB = 40;
    const iw = w - padL - padR;
    const ih = h - padT - padB;

    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = Math.max(maxV - minV, 1);
    const yMin = minV - span * 0.12;
    const yMax = maxV + span * 0.12;
    const yRange = yMax - yMin;
    const yAt = (v: number) => padT + ih - ((v - yMin) / yRange) * ih;
    const xAt = (i: number) => (n <= 1 ? padL + iw / 2 : padL + (i / (n - 1)) * iw);

    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = series[i].eurPerPoint;
      const b = series[i + 1].eurPerPoint;
      if (a != null && b != null) {
        segments.push({ x1: xAt(i), y1: yAt(a), x2: xAt(i + 1), y2: yAt(b) });
      }
    }

    const ticks = 4;
    const yTicks: { y: number; label: string }[] = [];
    for (let t = 0; t <= ticks; t++) {
      const v = yMin + (t / ticks) * (yMax - yMin);
      yTicks.push({
        y: yAt(v),
        label: `€${Math.round(v).toLocaleString("en-US")}`,
      });
    }

    return { w, h, padL, padT, padB, iw, ih, segments, xAt, yAt, series, yTicks, yMin, yMax };
  }, [series]);

  if (!layout) {
    return (
      <p className="text-sm text-[var(--color-cannes-muted)]">
        No cost-per-point data for this category (fee or points missing for all years).
      </p>
    );
  }

  const { w, h, padL, padT, segments, xAt, series: s, yTicks } = layout;

  return (
    <svg
      className="mx-auto max-h-[min(280px,70vw)] w-full text-[var(--color-cannes-ink)]"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Cost per point by festival year"
    >
      <rect
        x={padL}
        y={padT}
        width={layout.iw}
        height={layout.ih}
        fill="none"
        stroke="var(--color-cannes-line)"
        strokeWidth={1}
        rx={4}
      />
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={padL + layout.iw}
            y1={t.y}
            y2={t.y}
            stroke="var(--color-cannes-line)"
            strokeOpacity={0.35}
            strokeDasharray="4 4"
          />
          <text
            x={padL - 8}
            y={t.y + 4}
            textAnchor="end"
            className="fill-[var(--color-cannes-muted)]"
            fontSize={10}
          >
            {t.label}
          </text>
        </g>
      ))}
      {segments.map((seg, i) => (
        <line
          key={i}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke="var(--color-cannes-ink)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {s.map((row, i) => {
        if (row.eurPerPoint == null) return null;
        const cx = xAt(i);
        const cy = layout.yAt(row.eurPerPoint);
        return (
          <g key={row.year}>
            <circle cx={cx} cy={cy} r={4} fill="white" stroke="var(--color-cannes-ink)" strokeWidth={2} />
            <title>{`${row.year}: ${formatMoneyPer(row.eurPerPoint)} / pt`}</title>
          </g>
        );
      })}
      {s.map((row, i) => (
        <text
          key={`y-${row.year}`}
          x={xAt(i)}
          y={h - 8}
          textAnchor="middle"
          className="fill-[var(--color-cannes-muted)]"
          fontSize={10}
        >
          {row.year}
        </text>
      ))}
    </svg>
  );
}

const PROB_SERIES: {
  field: keyof Pick<
    ProbabilityRates,
    "pAtLeastOnePoint" | "pBronze" | "pSilver" | "pGold"
  >;
  label: string;
  stroke: string;
}[] = [
  { field: "pAtLeastOnePoint", label: "≥1 point", stroke: "var(--color-cannes-ink)" },
  { field: "pBronze", label: "Bronze", stroke: "var(--color-cannes-bronze)" },
  { field: "pSilver", label: "Silver", stroke: "var(--color-cannes-silver)" },
  { field: "pGold", label: "Gold", stroke: "var(--color-cannes-gold)" },
];

const PROB_SERIES_TITANIUM: {
  field: "pTitanium";
  label: string;
  stroke: string;
}[] = [{ field: "pTitanium", label: "Titanium Lion", stroke: "var(--color-cannes-award-black)" }];

function DiminishedReturnsTable({
  rates,
  titaniumOnly = false,
}: {
  rates: ProbabilityRates | undefined;
  titaniumOnly?: boolean;
}) {
  if (!rates) {
    return (
      <p className="px-4 py-8 text-sm text-[var(--color-cannes-muted)]">No probability data for this category.</p>
    );
  }
  const seriesDef = titaniumOnly ? PROB_SERIES_TITANIUM : PROB_SERIES;
  const active = seriesDef.filter((s) => rates[s.field] != null && !Number.isNaN(rates[s.field] as number));
  if (active.length === 0) {
    return (
      <p className="px-4 py-8 text-sm text-[var(--color-cannes-muted)]">
        Not enough historical data to estimate single-piece probabilities for this category.
      </p>
    );
  }

  return (
    <table className="w-full min-w-[640px] border-collapse text-left text-xs sm:text-sm">
      <thead>
        <tr className="border-b border-[var(--color-cannes-line)] bg-stone-50/80">
          <th
            className="sticky left-0 z-[1] bg-stone-50/95 px-3 py-3 font-medium text-[var(--color-cannes-ink)]"
            rowSpan={2}
            scope="col"
          >
            Pieces <span className="font-normal text-[var(--color-cannes-muted)]">(n)</span>
          </th>
          {active.map((s, i) => (
            <th
              key={s.field}
              colSpan={2}
              scope="colgroup"
              className={`px-3 py-2 text-center font-medium text-[var(--color-cannes-ink)] ${
                i > 0 ? "border-l border-[var(--color-cannes-line)]" : ""
              }`}
            >
              {s.label}
            </th>
          ))}
        </tr>
        <tr className="border-b border-[var(--color-cannes-line)] bg-stone-50/80">
          {active.flatMap((s, i) => [
            <th
              key={`${s.field}-cum`}
              scope="col"
              className={`whitespace-nowrap px-2 py-2 text-center font-normal tabular-nums text-[var(--color-cannes-muted)] ${
                i > 0 ? "border-l border-[var(--color-cannes-line)]" : ""
              }`}
            >
              Cumulative
            </th>,
            <th
              key={`${s.field}-mar`}
              scope="col"
              className="whitespace-nowrap px-2 py-2 text-center font-normal tabular-nums text-[var(--color-cannes-muted)]"
            >
              Marginal
            </th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {DIMINISHED_RETURNS_N.map((n) => (
          <tr key={n} className="border-b border-[var(--color-cannes-line)]/70 odd:bg-white/60">
            <th
              scope="row"
              className="sticky left-0 z-[1] bg-white/95 px-3 py-2 text-left font-medium tabular-nums text-[var(--color-cannes-ink)] odd:bg-stone-50/90"
            >
              {n}
            </th>
            {active.flatMap((s, i) => {
              const p = rates[s.field] as number;
              const cum = probAtLeastOneOfN(p, n);
              const mar = marginalProbGain(p, n);
              return [
                <td
                  key={`${s.field}-cum-${n}`}
                  className={`px-2 py-2 text-right tabular-nums text-[var(--color-cannes-ink)] ${
                    i > 0 ? "border-l border-[var(--color-cannes-line)]/60" : ""
                  }`}
                >
                  {formatProbPct(cum)}
                </td>,
                <td
                  key={`${s.field}-mar-${n}`}
                  className="px-2 py-2 text-right tabular-nums text-[var(--color-cannes-muted)]"
                >
                  {formatProbPct(mar)}
                </td>,
              ];
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MaxConcurrentSubmissionsSummaryTable({
  labels2025,
  bySub,
  titaniumOnly = false,
}: {
  labels2025: string[];
  bySub: CategoryProbabilities["bySubcategory"];
  titaniumOnly?: boolean;
}) {
  if (labels2025.length === 0) {
    return (
      <p className="px-4 py-8 text-sm text-[var(--color-cannes-muted)]">
        No 2025 subcategory labels in the dataset for this category.
      </p>
    );
  }

  return (
    <table className="w-full min-w-[720px] border-collapse text-left text-xs sm:text-sm">
      <thead>
        <tr className="border-b border-[var(--color-cannes-line)] bg-stone-50/80">
          <th className="sticky left-0 z-[1] bg-stone-50/95 px-3 py-3 font-medium text-[var(--color-cannes-ink)]">
            Subcategory
          </th>
          <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
            Max Submissions
            <span className="block text-[10px] font-normal normal-case tracking-normal text-[var(--color-cannes-muted)]">
              recommended
            </span>
          </th>
          {titaniumOnly ? (
            <th className="whitespace-nowrap border-l border-[var(--color-cannes-line)] px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
              P(Titanium) @ <em className="font-serif not-italic">n</em>
            </th>
          ) : (
            <>
              <th className="whitespace-nowrap border-l border-[var(--color-cannes-line)] px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
                P(≥1) @ <em className="font-serif not-italic">n</em>
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
                P(Bronze) @ <em className="font-serif not-italic">n</em>
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
                P(Silver) @ <em className="font-serif not-italic">n</em>
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
                P(Gold) @ <em className="font-serif not-italic">n</em>
              </th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {labels2025.map((label) => {
          const r = bySub[label];
          const pRate = titaniumOnly ? r?.pTitanium : r?.pAtLeastOnePoint;
          const cap = recommendedMaxConcurrentPiecesFromRate(pRate);
          return (
            <tr key={label} className="border-b border-[var(--color-cannes-line)] last:border-0 hover:bg-stone-50/50">
              <td className="sticky left-0 z-[1] max-w-[min(280px,45vw)] bg-white/95 px-3 py-2.5 text-xs leading-snug text-[var(--color-cannes-ink)]">
                {label}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums font-medium text-[var(--color-cannes-ink)]">
                {cap != null ? cap : "—"}
              </td>
              {titaniumOnly ? (
                <td className="whitespace-nowrap border-l border-[var(--color-cannes-line)]/80 px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                  {cap != null ? formatProbPct(probAtLeastOneOfN(r?.pTitanium, cap)) : "—"}
                </td>
              ) : (
                <>
                  <td className="whitespace-nowrap border-l border-[var(--color-cannes-line)]/80 px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                    {cap != null ? formatProbPct(probAtLeastOneOfN(r?.pAtLeastOnePoint, cap)) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                    {cap != null ? formatProbPct(probAtLeastOneOfN(r?.pBronze, cap)) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                    {cap != null ? formatProbPct(probAtLeastOneOfN(r?.pSilver, cap)) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                    {cap != null ? formatProbPct(probAtLeastOneOfN(r?.pGold, cap)) : "—"}
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CategoryProbabilityChart({
  rates,
  titaniumOnly = false,
}: {
  rates: ProbabilityRates | undefined;
  titaniumOnly?: boolean;
}) {
  const layout = useMemo(() => {
    if (!rates) return null;
    const w = 800;
    const h = 280;
    const padL = 48;
    const padR = 20;
    const padT = 16;
    const padB = 52;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    const nMax = 20;
    const seriesDef = titaniumOnly ? PROB_SERIES_TITANIUM : PROB_SERIES;
    const active = seriesDef.filter((s) => rates[s.field] != null && !Number.isNaN(rates[s.field] as number));
    if (active.length === 0) return null;

    const xAt = (i: number) => padL + (i / (nMax - 1)) * iw;
    const yAt = (v: number) => padT + ih * (1 - v);

    const polylines: { label: string; stroke: string; d: string }[] = [];
    for (const s of active) {
      const p = rates[s.field] as number;
      const parts: string[] = [];
      for (let n = 1; n <= nMax; n++) {
        const py = probAtLeastOneOfN(p, n);
        if (py == null) continue;
        const i = n - 1;
        const x = xAt(i);
        const y = yAt(py);
        parts.push(`${parts.length === 0 ? "M" : "L"} ${x} ${y}`);
      }
      if (parts.length) polylines.push({ label: s.label, stroke: s.stroke, d: parts.join(" ") });
    }

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((v) => ({
      v,
      y: yAt(v),
      label: `${Math.round(v * 100)}%`,
    }));

    return { w, h, padL, padT, iw, ih, polylines, xAt, yAt, yTicks, nMax, legendSeries: active };
  }, [rates, titaniumOnly]);

  if (!rates) {
    return (
      <p className="text-sm text-[var(--color-cannes-muted)]">No probability data for this category.</p>
    );
  }

  if (!layout) {
    return (
      <p className="text-sm text-[var(--color-cannes-muted)]">
        Not enough historical data to estimate single-piece probabilities for this category.
      </p>
    );
  }

  const { w, h, padL, padT, polylines, xAt, yTicks, legendSeries } = layout;

  return (
    <div>
      <svg
        className="mx-auto max-h-[min(300px,75vw)] w-full text-[var(--color-cannes-ink)]"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={
          titaniumOnly
            ? "Probability of at least one Titanium Lion versus number of independent pieces submitted to this category"
            : "Probability of at least one outcome versus number of independent pieces submitted to this category"
        }
      >
        <rect
          x={padL}
          y={padT}
          width={layout.iw}
          height={layout.ih}
          fill="none"
          stroke="var(--color-cannes-line)"
          strokeWidth={1}
          rx={4}
        />
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={padL + layout.iw}
              y1={t.y}
              y2={t.y}
              stroke="var(--color-cannes-line)"
              strokeOpacity={0.35}
              strokeDasharray="4 4"
            />
            <text
              x={padL - 8}
              y={t.y + 4}
              textAnchor="end"
              className="fill-[var(--color-cannes-muted)]"
              fontSize={10}
            >
              {t.label}
            </text>
          </g>
        ))}
        {polylines.map((pl) => (
          <path key={pl.label} d={pl.d} fill="none" stroke={pl.stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {DIMINISHED_RETURNS_N.map((n) => (
          <text
            key={n}
            x={xAt(n - 1)}
            y={h - 12}
            textAnchor="middle"
            className="fill-[var(--color-cannes-muted)]"
            fontSize={10}
          >
            {n}
          </text>
        ))}
        <text
          x={padL + layout.iw / 2}
          y={h - 2}
          textAnchor="middle"
          className="fill-[var(--color-cannes-muted)]"
          fontSize={10}
        >
          Number of pieces submitted
        </text>
      </svg>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-[var(--color-cannes-muted)]">
        {legendSeries.map((s) => (
          <span key={s.field} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.stroke }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SubcategoryProbabilityTable({
  labels2025,
  bySub,
  titaniumOnly = false,
}: {
  labels2025: string[];
  bySub: CategoryProbabilities["bySubcategory"];
  titaniumOnly?: boolean;
}) {
  if (labels2025.length === 0) {
    return (
      <p className="px-4 py-8 text-sm text-[var(--color-cannes-muted)]">
        No 2025 subcategory labels in the dataset for this category.
      </p>
    );
  }

  return (
    <table className="w-full min-w-[560px] border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-[var(--color-cannes-line)] bg-stone-50/80">
          <th className="sticky left-0 z-[1] bg-stone-50/95 px-3 py-3 font-medium text-[var(--color-cannes-ink)]">
            Subcategory
          </th>
          {titaniumOnly ? (
            <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
              Titanium Lion
              <span className="block text-[10px] font-normal normal-case tracking-normal text-[var(--color-cannes-muted)]">
                avg.
              </span>
            </th>
          ) : (
            <>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
                ≥1 point
                <span className="block text-[10px] font-normal normal-case tracking-normal text-[var(--color-cannes-muted)]">
                  avg.
                </span>
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
                Bronze
                <span className="block text-[10px] font-normal normal-case tracking-normal text-[var(--color-cannes-muted)]">
                  avg.
                </span>
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
                Silver
                <span className="block text-[10px] font-normal normal-case tracking-normal text-[var(--color-cannes-muted)]">
                  avg.
                </span>
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
                Gold
                <span className="block text-[10px] font-normal normal-case tracking-normal text-[var(--color-cannes-muted)]">
                  avg.
                </span>
              </th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {labels2025.map((label) => {
          const r = bySub[label];
          const p1 = r?.pAtLeastOnePoint;
          const pb = r?.pBronze;
          const ps = r?.pSilver;
          const pg = r?.pGold;
          const pt = r?.pTitanium;
          return (
            <tr
              key={label}
              className="border-b border-[var(--color-cannes-line)] last:border-0 hover:bg-stone-50/50"
            >
              <td className="sticky left-0 z-[1] max-w-[min(280px,45vw)] bg-white/95 px-3 py-2.5 text-xs leading-snug text-[var(--color-cannes-ink)]">
                {label}
              </td>
              {titaniumOnly ? (
                <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                  {formatProbPct(pt)}
                </td>
              ) : (
                <>
                  <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                    {formatProbPct(p1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                    {formatProbPct(pb)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                    {formatProbPct(ps)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                    {formatProbPct(pg)}
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SubcategoryCostTable({
  labels2025,
  avgEurPerPoint,
  entriesPerMetalBySub,
  priorityBySub,
}: {
  labels2025: string[];
  avgEurPerPoint: Record<string, number | null>;
  entriesPerMetalBySub: Record<string, number | null>;
  priorityBySub: Record<string, number | null>;
}) {
  if (labels2025.length === 0) {
    return (
      <p className="px-4 py-8 text-sm text-[var(--color-cannes-muted)]">
        No 2025 subcategory labels in the dataset for this category.
      </p>
    );
  }

  return (
    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-[var(--color-cannes-line)] bg-stone-50/80">
          <th className="px-3 py-3 font-medium text-[var(--color-cannes-ink)]">Subcategory</th>
          <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
            Avg. €
            <span className="block text-[10px] font-normal normal-case tracking-normal text-[var(--color-cannes-muted)]">
              per point awarded
            </span>
          </th>
          <th className="whitespace-nowrap px-3 py-3 text-left font-medium tabular-nums text-[var(--color-cannes-ink)]">
            Avg. Entries
            <span className="block text-[10px] font-normal normal-case tracking-normal text-[var(--color-cannes-muted)]">
              per metal win
            </span>
          </th>
          <th className="min-w-[140px] px-3 py-3 font-medium text-[var(--color-cannes-ink)]">Priority</th>
        </tr>
      </thead>
      <tbody>
        {labels2025.map((label) => {
          const p = priorityBySub[label];
          return (
            <tr
              key={label}
              className="border-b border-[var(--color-cannes-line)] last:border-0 hover:bg-stone-50/50"
            >
              <td className="max-w-[min(360px,70vw)] px-3 py-2.5 text-xs leading-snug text-[var(--color-cannes-ink)]">
                {label}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                {formatMoneyPer(avgEurPerPoint[label] ?? undefined)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-left tabular-nums text-[var(--color-cannes-muted)]">
                {entriesPerMetalBySub[label] != null
                  ? entriesPerMetalBySub[label].toLocaleString("en-US", {
                      maximumFractionDigits: 1,
                    })
                  : "—"}
              </td>
              <td className="px-3 py-2.5">
                {p != null ? (
                  <div
                    className="flex max-w-[200px] items-center gap-2"
                    title="Higher priority when average €/point and entries per metal win are both lower than other subcategories here"
                  >
                    <div
                      className="h-1.5 min-w-[100px] flex-1 overflow-hidden rounded-full bg-stone-200/90"
                      role="meter"
                      aria-valuenow={p}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Priority ${p} out of 100`}
                    >
                      <div
                        className="h-full rounded-full bg-[var(--color-cannes-ink)] transition-[width]"
                        style={{ width: `${p}%` }}
                      />
                    </div>
                    <span className="shrink-0 tabular-nums text-xs text-[var(--color-cannes-muted)]">{p}</span>
                  </div>
                ) : (
                  <span className="text-[var(--color-cannes-muted)]">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Stacked bar: top → bottom = Gold … Shortlist. Excludes Grand Prix and Titanium Lion (category-specific award). */
const ENTRIES_CHART_PARTS: {
  field: keyof Pick<CategoryYearSeriesRow, "gold" | "silver" | "bronze" | "shortlists">;
  label: string;
  colorKey: AwardSegmentKey;
}[] = [
  { field: "gold", label: "Gold", colorKey: "gold" },
  { field: "silver", label: "Silver", colorKey: "silver" },
  { field: "bronze", label: "Bronze", colorKey: "bronze" },
  { field: "shortlists", label: "Shortlist", colorKey: "shortlists" },
];

/** Titanium category: shortlist + Titanium Lion rows only (matches home cards). */
const ENTRIES_CHART_PARTS_TITANIUM: {
  field: keyof Pick<CategoryYearSeriesRow, "titaniumLion" | "shortlists">;
  label: string;
  colorKey: AwardSegmentKey;
}[] = [
  { field: "titaniumLion", label: "Titanium Lion", colorKey: "titaniumLion" },
  { field: "shortlists", label: "Shortlist", colorKey: "shortlists" },
];

function theWorkRowsForChart(row: CategoryYearSeriesRow, isTitaniumCategory: boolean): number {
  if (isTitaniumCategory) return row.shortlists + row.titaniumLion;
  return row.shortlists + row.bronze + row.silver + row.gold;
}

function EntriesChartLegend({ isTitaniumCategory }: { isTitaniumCategory: boolean }) {
  const parts = isTitaniumCategory ? ENTRIES_CHART_PARTS_TITANIUM : ENTRIES_CHART_PARTS;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[var(--color-cannes-muted)]">
      {parts.map(({ label, colorKey }) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm shadow-sm"
            style={segmentStyle(colorKey)}
            aria-hidden
          />
          {label}
        </span>
      ))}
    </div>
  );
}

const CHART_COL_H = 128;

function EntriesChart({
  series,
  isTitaniumCategory,
}: {
  series: CategoryYearSeriesRow[];
  isTitaniumCategory: boolean;
}) {
  if (!series.length) return null;

  const parts = isTitaniumCategory ? ENTRIES_CHART_PARTS_TITANIUM : ENTRIES_CHART_PARTS;

  return (
    <div className="flex items-end gap-1 sm:gap-1.5">
      {series.map((row: CategoryYearSeriesRow) => {
        const total = theWorkRowsForChart(row, isTitaniumCategory);
        const noEntries = row.entries === 0;
        const yearClass = noEntries ? "text-zinc-400" : "text-[var(--color-cannes-muted)]";
        const entryClass = noEntries ? "text-zinc-400" : "text-[var(--color-cannes-muted)]";

        const tip = isTitaniumCategory
          ? [
              `${row.year}: ${row.entries.toLocaleString("en-US")} entries`,
              total > 0
                ? `${total.toLocaleString("en-US")} The Work rows: SL ${row.shortlists} · Ti ${row.titaniumLion}`
                : "No shortlist or Titanium Lion rows",
            ].join(" · ")
          : [
              `${row.year}: ${row.entries.toLocaleString("en-US")} entries`,
              total > 0
                ? `${total.toLocaleString("en-US")} The Work rows (excl. GP & Ti): SL ${row.shortlists} · Br ${row.bronze} · Ag ${row.silver} · Au ${row.gold}`
                : "No shortlist or metal rows (excl. GP & Ti)",
            ].join(" · ");

        return (
          <div
            key={row.year}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            title={tip}
          >
            <span className={`text-center text-[9px] tabular-nums sm:text-[10px] ${entryClass}`}>
              {row.entries.toLocaleString("en-US")}
            </span>
            <div
              className="flex w-full max-w-[52px] flex-col overflow-hidden rounded-md shadow-inner"
              style={{ height: CHART_COL_H }}
            >
              {total === 0 ? (
                <div className="h-full w-full bg-zinc-200/90" aria-hidden />
              ) : (
                parts.map(({ field, colorKey }) => {
                  const n = row[field];
                  const pct = (n / total) * 100;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={field}
                      className="min-h-px shrink-0"
                      style={{
                        height: `${pct}%`,
                        ...segmentStyle(colorKey),
                      }}
                    />
                  );
                })
              )}
            </div>
            <span
              className={`text-center text-[10px] font-medium tabular-nums sm:text-[11px] ${yearClass}`}
            >
              {row.year}
            </span>
          </div>
        );
      })}
    </div>
  );
}
