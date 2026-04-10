export type CategoryStatsRow = {
  slug: string;
  entries: number;
  counts: {
    shortlist: number;
    bronze: number;
    silver: number;
    gold: number;
    grandPrix: number;
    titaniumLion: number;
    metalPieces: number;
  };
  pct: {
    shortlist: number | null;
    bronze: number | null;
    silver: number | null;
    gold: number | null;
    grandPrix: number | null;
    titaniumLion: number | null;
    metal: number | null;
  };
};

export type CategoryStatsPayload = {
  generated_at: string;
  years: number[];
  categories: string[];
  byYear: Record<string, CategoryStatsRow[]>;
};

export type CategoryYearSeriesRow = {
  year: number;
  entries: number;
  shortlists: number;
  bronze: number;
  silver: number;
  gold: number;
  grandPrix: number;
  titaniumLion: number;
  metals: number;
  points: number;
  eurPerPoint: number | null;
  eurPerMetal: number | null;
};

export type CategoryAggregateStats = {
  entriesTotal: number;
  metalsTotal: number;
  shortlistsTotal: number;
  pointsTotal: number;
  /** feeEur × entriesTotal; null if no fee. */
  impliedSpendTotalEur: number | null;
  /** Pooled (entries × fee) ÷ points across all years; null if no fee or no points. */
  eurPerPointPooled: number | null;
  /** Mean shortlist rows per festival year in the series. */
  avgShortlistsPerYear: number | null;
  /** Mean metal win rows per festival year in the series. */
  avgMetalsPerYear: number | null;
  /** Pooled entries ÷ metals; null if no metal rows. */
  entriesPerMetal: number | null;
  /** Min–max vs other categories (0–100); null if no metals; 50 if all tie. */
  competitivenessScore: number | null;
  /** Mean % of published entries whose LoveThework rows sum to 0 award points (by festival year). */
  avgFailureRatePct: number | null;
};

/** Single-piece empirical rates (0–1); compound n uses independence on the client. */
export type ProbabilityRates = {
  pAtLeastOnePoint: number | null;
  pBronze: number | null;
  pSilver: number | null;
  pGold: number | null;
  /** Titanium Lion win rows ÷ entries (meaningful for the Titanium category; optional elsewhere). */
  pTitanium: number | null;
};

export type CategoryProbabilities = {
  category: ProbabilityRates;
  bySubcategory: Record<string, ProbabilityRates>;
};

export type SubcategoryCostBreakdown = {
  /** Subcategory labels observed in 2025 LoveThework data for this category. */
  labels2025: string[];
  /** Pooled average €/point across all festival years (null when no fee or no points). */
  avgEurPerPoint: Record<string, number | null>;
  /** Pooled effective entries ÷ metal win rows (same success + line-share model as €/pt). */
  entriesPerMetalBySub: Record<string, number | null>;
  /** 0–100 within category; higher = lower €/pt and lower entries/metal vs other subs (null if either metric missing). */
  priorityBySub: Record<string, number | null>;
};

/** From LoveThework winner rows; `bucket` from points_rule via build script. */
export type CategoryWinnerRow = {
  year: number;
  bucket: "bronze" | "silver" | "gold" | "grandPrix" | "titaniumLion" | "shortlist" | null;
  prize: string;
  title: string;
  brand: string;
  subcategory: string;
  entrant: string;
  location: string;
  entry_url: string | null;
};

export type CategoryWinnersPayload = {
  generated_at: string;
  bySlug: Record<string, CategoryWinnerRow[]>;
};

export type CategoryDetailsPayload = {
  generated_at: string;
  fee_note: string;
  fee_source: string;
  currency: string;
  /** All category slugs (same order as category-stats.json `categories`). */
  categories: string[];
  /** When some years use hub counts because /results has no table. */
  hub_overrides_note: string | null;
  competitiveness_note: string;
  /** Methodology for subcategory €/pt table. */
  subcategory_cost_note?: string;
  bySlug: Record<
    string,
    {
      feeEur: number | null;
      series: CategoryYearSeriesRow[];
      aggregate: CategoryAggregateStats;
      subcategoryCost?: SubcategoryCostBreakdown;
      probabilities?: CategoryProbabilities;
    }
  >;
};
