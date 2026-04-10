import { Link } from "react-router-dom";
import {
  awardSumForCard,
  cardSegmentKeys,
  countForCardKey,
  segmentStyle,
  TITANIUM_CATEGORY_SLUG,
} from "./lib/awardSegments";
import { slugToLabel } from "./lib/labels";
import type { CategoryStatsRow } from "./types";

function Pct({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[var(--color-cannes-muted)]">—</span>;
  return <span>{value}%</span>;
}

function fmtInt(n: number) {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function fmtMetalAvg(n: number) {
  if (!Number.isFinite(n)) return "—";
  const v = Math.round(n * 10) / 10;
  return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function pctOfAvgEntries(avgSegment: number, avgEntries: number): number | null {
  if (!Number.isFinite(avgEntries) || avgEntries <= 0) return null;
  return Math.round((avgSegment / avgEntries) * 1000) / 10;
}

export type CycleAverages = {
  avgEntriesPerYear: number;
  avgMetalPerYear: number;
  avgShortlistPerYear: number;
  avgBronzePerYear: number;
  avgSilverPerYear: number;
  avgGoldPerYear: number;
  avgTitaniumLionPerYear: number;
};

function cycleToAvgCounts(cycle: CycleAverages): CategoryStatsRow["counts"] {
  return {
    shortlist: cycle.avgShortlistPerYear,
    bronze: cycle.avgBronzePerYear,
    silver: cycle.avgSilverPerYear,
    gold: cycle.avgGoldPerYear,
    grandPrix: 0,
    titaniumLion: cycle.avgTitaniumLionPerYear,
    metalPieces: cycle.avgMetalPerYear,
  };
}

export function CategoryCard({
  row,
  cycle,
}: {
  row: CategoryStatsRow;
  cycle: CycleAverages;
}) {
  const title = slugToLabel(row.slug);
  const isTitanium = row.slug === TITANIUM_CATEGORY_SLUG;
  const avgCounts = cycleToAvgCounts(cycle);
  const { avgEntriesPerYear, avgMetalPerYear } = cycle;
  const metalPctOfEntries = pctOfAvgEntries(avgMetalPerYear, avgEntriesPerYear);

  return (
    <Link
      to={`/category/${row.slug}`}
      className="group flex flex-col rounded-2xl border border-[var(--color-cannes-line)] bg-white/90 p-5 shadow-sm outline-none transition hover:border-[#d4cfc4] hover:shadow-md focus-visible:ring-2 focus-visible:ring-zinc-400"
    >
      <h2 className="font-[family-name:var(--font-display)] text-xl font-normal tracking-tight text-[var(--color-cannes-ink)] md:text-[1.35rem]">
        {title}
      </h2>
      <div className="mt-2 flex items-baseline justify-between gap-3 text-xs leading-relaxed">
        <p className="min-w-0 text-left text-[var(--color-cannes-muted)]">
          <strong className="font-medium text-[var(--color-cannes-ink)]">{fmtInt(cycle.avgEntriesPerYear)}</strong>{" "}
          entries ·{" "}
          <strong className="font-medium text-[var(--color-cannes-ink)]">{fmtMetalAvg(cycle.avgMetalPerYear)}</strong>{" "}
          metal wins
        </p>
        <span className="shrink-0 text-right text-[var(--color-cannes-muted)]">avg. per year</span>
      </div>

      <AwardMixBar counts={avgCounts} slug={row.slug} />

      <div className="mt-4 space-y-3">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-[var(--color-cannes-ink)]">Avg. metal wins</span>
            <span className="text-sm tabular-nums text-[var(--color-cannes-ink)]">
              <Pct value={metalPctOfEntries} />
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2.5 border-t border-[var(--color-cannes-line)] pt-3">
          <OutcomeRowInline
            label="Shortlist"
            pct={pctOfAvgEntries(cycle.avgShortlistPerYear, avgEntriesPerYear)}
            av={cycle.avgShortlistPerYear}
          />
          {isTitanium ? (
            <MetalRowInline
              label="Titanium Lion"
              color="bg-[var(--color-cannes-award-black)]"
              pct={pctOfAvgEntries(cycle.avgTitaniumLionPerYear, avgEntriesPerYear)}
              av={cycle.avgTitaniumLionPerYear}
            />
          ) : (
            <>
              <MetalRowInline
                label="Bronze"
                color="bg-[var(--color-cannes-bronze)]"
                pct={pctOfAvgEntries(cycle.avgBronzePerYear, avgEntriesPerYear)}
                av={cycle.avgBronzePerYear}
              />
              <MetalRowInline
                label="Silver"
                color="bg-[var(--color-cannes-silver)]"
                pct={pctOfAvgEntries(cycle.avgSilverPerYear, avgEntriesPerYear)}
                av={cycle.avgSilverPerYear}
              />
              <MetalRowInline
                label="Gold"
                color="bg-[var(--color-cannes-gold)]"
                pct={pctOfAvgEntries(cycle.avgGoldPerYear, avgEntriesPerYear)}
                av={cycle.avgGoldPerYear}
              />
              {cycle.avgTitaniumLionPerYear > 0.05 && (
                <MetalRowInline
                  label="Titanium Lion"
                  color="bg-[var(--color-cannes-award-black)]"
                  pct={pctOfAvgEntries(cycle.avgTitaniumLionPerYear, avgEntriesPerYear)}
                  av={cycle.avgTitaniumLionPerYear}
                />
              )}
            </>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs font-medium text-zinc-500 group-hover:text-zinc-700">
        View details →
      </p>
    </Link>
  );
}

function AwardMixBar({ counts, slug }: { counts: CategoryStatsRow["counts"]; slug: string }) {
  const sum = awardSumForCard(counts, slug);
  const keys = cardSegmentKeys(slug);

  return (
    <div className="mt-3">
      <div className="h-2.5 w-full overflow-hidden rounded-full shadow-inner ring-1 ring-inset ring-black/5">
        {sum > 0 ? (
          <div className="flex h-full w-full overflow-hidden rounded-full">
            {keys.map((key) => {
              const n = countForCardKey(counts, key);
              if (!n) return null;
              return (
                <div
                  key={key}
                  className="min-h-full min-w-px shrink"
                  style={{ flexGrow: n, ...segmentStyle(key) }}
                />
              );
            })}
          </div>
        ) : (
          <div className="h-full w-full bg-zinc-200/80" />
        )}
      </div>
    </div>
  );
}

function OutcomeRowInline({
  label,
  pct,
  av,
}: {
  label: string;
  pct: number | null;
  av: number;
}) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap text-[13px]">
      <span
        className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-cannes-shortlist)]"
        aria-hidden
      />
      <span className="text-[var(--color-cannes-muted)]">{label}</span>
      <span className="tabular-nums font-medium text-[var(--color-cannes-ink)]">
        <Pct value={pct} />
      </span>
      <span className="text-[11px] tabular-nums text-[var(--color-cannes-muted)]">{fmtMetalAvg(av)}</span>
    </div>
  );
}

function MetalRowInline({
  label,
  color,
  pct,
  av,
}: {
  label: string;
  color: string;
  pct: number | null;
  av: number;
}) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap text-[13px]">
      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />
      <span className="text-[var(--color-cannes-muted)]">{label}</span>
      <span className="tabular-nums font-medium text-[var(--color-cannes-ink)]">
        <Pct value={pct} />
      </span>
      <span className="text-[11px] tabular-nums text-[var(--color-cannes-muted)]">{fmtMetalAvg(av)}</span>
    </div>
  );
}
