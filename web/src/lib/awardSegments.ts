import type { CategoryStatsRow, CategoryYearSeriesRow } from "../types";

/** Order: bottom → top in vertical stacks; left → right in horizontal bars */
export type AwardSegmentKey =
  | "shortlists"
  | "bronze"
  | "silver"
  | "gold"
  | "grandPrix"
  | "titaniumLion";

export const AWARD_STACK_ORDER: AwardSegmentKey[] = [
  "shortlists",
  "bronze",
  "silver",
  "gold",
  "grandPrix",
  "titaniumLion",
];

/** Home cards: no Grand Prix; Titanium Lion category is shortlist + Titanium only */
export const TITANIUM_CATEGORY_SLUG = "titanium";

export function cardSegmentKeys(slug: string): AwardSegmentKey[] {
  if (slug === TITANIUM_CATEGORY_SLUG) return ["shortlists", "titaniumLion"];
  return ["shortlists", "bronze", "silver", "gold", "titaniumLion"];
}

/** Metals shown on cards (excludes Grand Prix). Titanium category → Titanium Lions only. */
export function metalCountForCardDisplay(c: CategoryStatsRow["counts"], slug: string): number {
  if (slug === TITANIUM_CATEGORY_SLUG) return c.titaniumLion;
  return c.bronze + c.silver + c.gold + c.titaniumLion;
}

export function awardSumForCard(c: CategoryStatsRow["counts"], slug: string): number {
  return cardSegmentKeys(slug).reduce((acc, k) => acc + countForCardKey(c, k), 0);
}

export function awardSum(row: Pick<CategoryYearSeriesRow, AwardSegmentKey>) {
  return (
    row.shortlists +
    row.bronze +
    row.silver +
    row.gold +
    row.grandPrix +
    row.titaniumLion
  );
}

export function countForCardKey(c: CategoryStatsRow["counts"], key: AwardSegmentKey): number {
  if (key === "shortlists") return c.shortlist;
  return c[key];
}

export function awardSumCounts(c: CategoryStatsRow["counts"]) {
  return (
    c.shortlist +
    c.bronze +
    c.silver +
    c.gold +
    c.grandPrix +
    c.titaniumLion
  );
}

export function segmentStyle(key: AwardSegmentKey): { background: string } {
  switch (key) {
    case "shortlists":
      return { background: "var(--color-cannes-shortlist)" };
    case "bronze":
      return { background: "var(--color-cannes-bronze)" };
    case "silver":
      return { background: "var(--color-cannes-silver)" };
    case "gold":
      return { background: "var(--color-cannes-gold)" };
    case "grandPrix":
    case "titaniumLion":
      return { background: "var(--color-cannes-award-black)" };
    default:
      return { background: "#71717a" };
  }
}
