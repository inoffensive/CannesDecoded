/**
 * Resolve which full subcategory label set (with A01/B02 codes) to use for a
 * given Cannes category slug + festival year.
 *
 * Default: `category-details.json` → `probabilities.bySubcategory` keys (pooled).
 * Optional: `scripts/data/cannes-subcategories-by-year.json` → `bySlug.<slug>.<year>`
 * replaces that list for matching only (e.g. when Cannes renamed tracks in older years).
 */

/**
 * Labels from category-details for one slug (current pooled keys).
 * @param {object | null} details - category-details.json payload
 * @param {string} slug
 * @returns {string[]}
 */
export function canonicalLabelsFromCategoryDetails(details, slug) {
  const prob = details?.bySlug?.[slug]?.probabilities?.bySubcategory;
  return prob ? Object.keys(prob) : [];
}

/**
 * @param {object | null} yearOverrides - parsed cannes-subcategories-by-year.json body
 * @param {string} slug
 * @param {number} year
 * @returns {string[] | null} non-null = use this list (may be empty — caller should fall back)
 */
function labelsFromYearOverrides(yearOverrides, slug, year) {
  const perSlug = yearOverrides?.bySlug?.[slug];
  if (!perSlug || typeof perSlug !== "object") return null;
  const y = String(year);
  const raw = perSlug[y];
  if (!Array.isArray(raw)) return null;
  const labels = raw
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  return labels;
}

/**
 * @param {object | null} details - category-details.json payload
 * @param {string} slug
 * @param {number} year
 * @param {object | null} yearOverrides
 * @returns {{ labels: string[], source: 'category_details' | 'year_override' }}
 */
export function canonicalLabelsForSlugYear(details, slug, year, yearOverrides) {
  const fromFile = labelsFromYearOverrides(yearOverrides, slug, year);
  if (fromFile !== null && fromFile.length > 0) {
    return { labels: fromFile, source: "year_override" };
  }
  return {
    labels: canonicalLabelsFromCategoryDetails(details, slug),
    source: "category_details",
  };
}
