import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getNavThemesForAvailable,
  themeKeyForSlug,
  type NavThemeBlock,
} from "./lib/cannesCategoryGroups";
import { slugToLabel } from "./lib/labels";

const chipBase =
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition";
const chipMuted =
  "border-[var(--color-cannes-line)] bg-white/80 text-[var(--color-cannes-muted)] hover:border-zinc-400 hover:text-[var(--color-cannes-ink)]";
const chipBlack =
  "border-black bg-black text-white hover:bg-zinc-900 hover:border-zinc-900";
/** Active category (current page) — gray, distinct from black theme chip */
const chipCategoryActive =
  "border-zinc-400 bg-zinc-200 text-zinc-900 hover:bg-zinc-300 hover:border-zinc-500";

/** Same order on home and category pages: A–Z by display label. */
function orderLeafSlugsAlphabetical(slugs: readonly string[]): string[] {
  return [...slugs].sort((a, b) => slugToLabel(a).localeCompare(slugToLabel(b), "en"));
}

function AllThemeChipsRow({
  themes,
  onOpenTheme,
}: {
  themes: NavThemeBlock[];
  onOpenTheme: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {themes.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-expanded={false}
          className={`${chipBase} ${chipMuted}`}
          onClick={() => onOpenTheme(t.key)}
        >
          {t.title}
        </button>
      ))}
    </div>
  );
}

export function CategoryNavChips({
  availableSlugs,
  activeSlug,
  className = "",
}: {
  availableSlugs: Iterable<string>;
  activeSlug?: string;
  className?: string;
}) {
  const themes = useMemo(() => getNavThemesForAvailable(availableSlugs), [availableSlugs]);
  const slugSet = useMemo(() => new Set(availableSlugs), [availableSlugs]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  /** `/category/:slug` — single theme + categories only; no other themes; cannot collapse */
  const onCategoryPage = Boolean(activeSlug);

  useEffect(() => {
    const k = themeKeyForSlug(activeSlug, slugSet);
    if (k != null) setExpandedKey(k);
    else setExpandedKey(null);
  }, [activeSlug, slugSet]);

  if (themes.length === 0) return null;

  /** Category detail: locked to this theme */
  if (onCategoryPage) {
    const key = themeKeyForSlug(activeSlug, slugSet);
    const activeTheme = key ? themes.find((x) => x.key === key) : undefined;
    if (!activeTheme) {
      return (
        <nav aria-label="Categories" className={className}>
          <AllThemeChipsRow themes={themes} onOpenTheme={setExpandedKey} />
        </nav>
      );
    }
    const leaves = orderLeafSlugsAlphabetical(activeTheme.slugs);
    return (
      <nav aria-label="Categories" className={className}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${chipBase} ${chipBlack} cursor-default`}>{activeTheme.title}</span>
          <div
            role="region"
            aria-label={`${activeTheme.title} categories`}
            className="flex flex-wrap items-center gap-2"
          >
            {leaves.map((slug) => {
              const active = slug === activeSlug;
              return (
                <Link
                  key={slug}
                  to={`/category/${slug}`}
                  className={`${chipBase} ${active ? chipCategoryActive : chipMuted}`}
                  aria-current={active ? "page" : undefined}
                >
                  {slugToLabel(slug)}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    );
  }

  /** Homepage: collapse / expand */
  if (expandedKey === null) {
    return (
      <nav aria-label="Categories" className={className}>
        <AllThemeChipsRow themes={themes} onOpenTheme={setExpandedKey} />
      </nav>
    );
  }

  const activeTheme = themes.find((x) => x.key === expandedKey);
  if (!activeTheme) {
    return (
      <nav aria-label="Categories" className={className}>
        <AllThemeChipsRow themes={themes} onOpenTheme={setExpandedKey} />
      </nav>
    );
  }

  const leaves = orderLeafSlugsAlphabetical(activeTheme.slugs);

  return (
    <nav aria-label="Categories" className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded
          aria-controls="theme-panel-expanded"
          id="theme-btn-expanded"
          className={`${chipBase} ${chipBlack}`}
          onClick={() => setExpandedKey(null)}
        >
          {activeTheme.title}
        </button>

        <div
          id="theme-panel-expanded"
          role="region"
          aria-label={`${activeTheme.title} categories`}
          className="flex flex-wrap items-center gap-2"
        >
          {leaves.map((slug) => {
            const active = slug === activeSlug;
            return (
              <Link
                key={slug}
                to={`/category/${slug}`}
                className={`${chipBase} ${active ? chipCategoryActive : chipMuted}`}
                aria-current={active ? "page" : undefined}
              >
                {slugToLabel(slug)}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
