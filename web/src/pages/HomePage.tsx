import { useEffect, useMemo, useState } from "react";
import { CategoryCard } from "../CategoryCard";
import type { CycleAverages } from "../CategoryCard";
import { metalCountForCardDisplay } from "../lib/awardSegments";
import { CategoryNavChips } from "../CategoryNavChips";
import { partitionRowsByCannesGroups } from "../lib/cannesCategoryGroups";
import { SiteBrandIntro } from "../SiteBrandIntro";
import { SiteFooter } from "../SiteFooter";
import type { CategoryStatsPayload, CategoryStatsRow } from "../types";

/** Exclude incomplete / unwanted years from homepage averages. */
const EXCLUDED_YEARS = new Set([2025]);

function yearsForAverages(years: number[]) {
  return years.filter((y) => !EXCLUDED_YEARS.has(y));
}

function buildCycleAveragesBySlug(data: CategoryStatsPayload): Map<string, CycleAverages> {
  const years = yearsForAverages(data.years);
  const totals = new Map<
    string,
    {
      entries: number;
      metal: number;
      shortlist: number;
      bronze: number;
      silver: number;
      gold: number;
      titaniumLion: number;
      /** Years with entries > 0 only (category may not exist in earlier years). */
      activeYearCount: number;
    }
  >();

  for (const y of years) {
    for (const row of data.byYear[String(y)] ?? []) {
      if (row.entries <= 0) continue;
      const cur =
        totals.get(row.slug) ??
        {
          entries: 0,
          metal: 0,
          shortlist: 0,
          bronze: 0,
          silver: 0,
          gold: 0,
          titaniumLion: 0,
          activeYearCount: 0,
        };
      cur.activeYearCount += 1;
      cur.entries += row.entries;
      cur.metal += metalCountForCardDisplay(row.counts, row.slug);
      cur.shortlist += row.counts.shortlist;
      cur.bronze += row.counts.bronze;
      cur.silver += row.counts.silver;
      cur.gold += row.counts.gold;
      cur.titaniumLion += row.counts.titaniumLion;
      totals.set(row.slug, cur);
    }
  }

  const out = new Map<string, CycleAverages>();
  for (const [slug, t] of totals) {
    const n = t.activeYearCount;
    out.set(slug, {
      avgEntriesPerYear: t.entries / n,
      avgMetalPerYear: t.metal / n,
      avgShortlistPerYear: t.shortlist / n,
      avgBronzePerYear: t.bronze / n,
      avgSilverPerYear: t.silver / n,
      avgGoldPerYear: t.gold / n,
      avgTitaniumLionPerYear: t.titaniumLion / n,
    });
  }
  return out;
}

export default function HomePage() {
  const [data, setData] = useState<CategoryStatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/category-stats.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load stats (${r.status})`);
        return r.json() as Promise<CategoryStatsPayload>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const latestYear =
    data && data.years.length > 0 ? Math.max(...data.years) : null;

  const cycleBySlug = useMemo(
    () => (data ? buildCycleAveragesBySlug(data) : new Map<string, CycleAverages>()),
    [data],
  );

  const displayYearForRows = useMemo(() => {
    if (!data?.years.length) return null;
    const ys = [...data.years].sort((a, b) => b - a);
    return ys.find((y) => !EXCLUDED_YEARS.has(y)) ?? ys[0];
  }, [data]);

  const rows = useMemo((): CategoryStatsRow[] => {
    if (!data || displayYearForRows == null) return [];
    return data.byYear[String(displayYearForRows)] ?? [];
  }, [data, displayYearForRows]);

  const homepageSections = useMemo(() => partitionRowsByCannesGroups(rows), [rows]);

  const availableSlugSet = useMemo(() => new Set(rows.map((r) => r.slug)), [rows]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center text-red-700">
        {error}
      </div>
    );
  }

  if (!data || latestYear == null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center text-[var(--color-cannes-muted)]">
        Loading festival data…
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16">
      <header>
        <div className="mx-auto max-w-6xl px-4 py-10">
          <SiteBrandIntro />
          <CategoryNavChips className="mt-6" availableSlugs={availableSlugSet} />
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-12 px-4 pt-10"
        aria-labelledby="categories-overview-heading"
      >
        <h1
          id="categories-overview-heading"
          className="font-[family-name:var(--font-display)] text-4xl font-normal tracking-tight text-[var(--color-cannes-ink)]"
        >
          Categories Overview
        </h1>
        {homepageSections.map((section, idx) => (
          <section
            key={`${section.title}-${idx}`}
            className="space-y-4"
            aria-labelledby={`home-section-${idx}`}
          >
            <h2
              id={`home-section-${idx}`}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-cannes-muted)]"
            >
              {section.title}
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {section.rows.map((row) => (
                <CategoryCard
                  key={row.slug}
                  row={row}
                  cycle={
                    cycleBySlug.get(row.slug) ?? {
                      avgEntriesPerYear: 0,
                      avgMetalPerYear: 0,
                      avgShortlistPerYear: 0,
                      avgBronzePerYear: 0,
                      avgSilverPerYear: 0,
                      avgGoldPerYear: 0,
                      avgTitaniumLionPerYear: 0,
                    }
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <SiteFooter />
    </div>
  );
}
