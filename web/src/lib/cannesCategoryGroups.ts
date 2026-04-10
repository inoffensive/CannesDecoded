import type { CategoryStatsRow } from "../types";
import { slugToLabel } from "./labels";

/** Official Cannes Lions groupings (hub order). Slugs omitted from data are skipped at render time. */
export type CannesCategoryGroup = {
  key: string;
  /** Section heading shown above chips / card rows */
  title: string;
  slugs: string[];
};

export const CANNES_CATEGORY_GROUPS: CannesCategoryGroup[] = [
  { key: "brand", title: "Brand", slugs: ["creative-brand"] },
  {
    key: "classic",
    title: "Classic",
    slugs: ["audio-radio", "film", "outdoor", "print-publishing"],
  },
  {
    key: "craft",
    title: "Craft",
    slugs: ["design", "digital-craft", "film-craft", "industry-craft"],
  },
  {
    key: "engagement",
    title: "Engagement",
    slugs: ["creative-b2b", "creative-data", "direct", "media", "pr", "social-creator"],
  },
  {
    key: "entertainment",
    title: "Entertainment",
    slugs: [
      "entertainment",
      "entertainment-lions-for-gaming",
      "entertainment-lions-for-music",
      "entertainment-lions-for-sport",
    ],
  },
  {
    key: "experience",
    title: "Experience",
    slugs: [
      "brand-experience-activation",
      "creative-business-transformation",
      "creative-commerce",
      "innovation",
      "luxury",
    ],
  },
  {
    key: "good",
    title: "Good",
    slugs: ["glass-the-lion-for-change", "sustainable-development-goals"],
  },
  { key: "health", title: "Health", slugs: ["health-wellness", "pharma"] },
  {
    key: "strategy",
    title: "Strategy",
    slugs: ["creative-effectiveness", "creative-strategy"],
  },
  { key: "titanium", title: "Titanium", slugs: ["titanium"] },
];

/** Same order as category chips: A–Z by display label (`slugToLabel`). */
function sortRowsAlphabeticalByLabel(rows: CategoryStatsRow[]): CategoryStatsRow[] {
  return [...rows].sort((a, b) => slugToLabel(a.slug).localeCompare(slugToLabel(b.slug), "en"));
}

/** Homepage cards: official group order, then A–Z by label within each group; unlisted slugs last. */
export function organizeRowsByCannesGroups(rows: CategoryStatsRow[]): CategoryStatsRow[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const used = new Set<string>();
  const out: CategoryStatsRow[] = [];

  for (const g of CANNES_CATEGORY_GROUPS) {
    const chunk = g.slugs.map((s) => bySlug.get(s)).filter((r): r is CategoryStatsRow => r != null);
    sortRowsAlphabeticalByLabel(chunk).forEach((r) => {
      out.push(r);
      used.add(r.slug);
    });
  }

  const rest = rows.filter((r) => !used.has(r.slug));
  sortRowsAlphabeticalByLabel(rest).forEach((r) => out.push(r));
  return out;
}

/** Theme + leaf slugs for expandable category nav (only themes with ≥1 available slug). */
export type NavThemeBlock = { key: string; title: string; slugs: string[] };

/** Rows grouped for homepage: official sections, alphabetical by label within each (matches chips). */
export function partitionRowsByCannesGroups(rows: CategoryStatsRow[]): { title: string; rows: CategoryStatsRow[] }[] {
  const organized = organizeRowsByCannesGroups(rows);
  const slugToGroupTitle = new Map<string, string>();
  for (const g of CANNES_CATEGORY_GROUPS) {
    for (const s of g.slugs) slugToGroupTitle.set(s, g.title);
  }

  const groups: { title: string; rows: CategoryStatsRow[] }[] = [];
  let currentTitle: string | null = null;
  let currentRows: CategoryStatsRow[] = [];

  for (const row of organized) {
    const title = slugToGroupTitle.get(row.slug) ?? "Other";
    if (currentTitle === null) {
      currentTitle = title;
      currentRows = [row];
    } else if (title === currentTitle) {
      currentRows.push(row);
    } else {
      groups.push({ title: currentTitle, rows: currentRows });
      currentTitle = title;
      currentRows = [row];
    }
  }
  if (currentTitle !== null && currentRows.length > 0) {
    groups.push({ title: currentTitle, rows: currentRows });
  }

  return groups;
}

export function getNavThemesForAvailable(availableSlugs: Iterable<string>): NavThemeBlock[] {
  const set = new Set(availableSlugs);
  const out: NavThemeBlock[] = [];

  for (const g of CANNES_CATEGORY_GROUPS) {
    const slugs = g.slugs.filter((s) => set.has(s));
    if (slugs.length === 0) continue;
    out.push({ key: g.key, title: g.title, slugs });
  }

  const listed = new Set(CANNES_CATEGORY_GROUPS.flatMap((x) => x.slugs));
  const orphans = [...set].filter((s) => !listed.has(s));
  if (orphans.length > 0) {
    orphans.sort((a, b) => slugToLabel(a).localeCompare(slugToLabel(b)));
    out.push({ key: "other", title: "Other", slugs: orphans });
  }

  return out;
}

/** Which theme chip should open for a category slug (orphans → `other` only if that slug is in `availableSlugs`). */
export function themeKeyForSlug(
  slug: string | undefined,
  availableSlugs?: Set<string>,
): string | null {
  if (slug == null || slug === "") return null;
  for (const g of CANNES_CATEGORY_GROUPS) {
    if (g.slugs.includes(slug)) return g.key;
  }
  if (availableSlugs?.has(slug)) return "other";
  return null;
}
