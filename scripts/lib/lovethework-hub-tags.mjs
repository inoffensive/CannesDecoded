/**
 * URL `tag=` values for Love The Work winners-shortlists hub filters.
 * @see scrape-cannes-category-entry-counts.mjs (year)
 * @see scrape-cannes-unawarded.mjs (year + unawarded)
 */

/** `publication+dates@@year@@YYYY` as used in hub URLs. */
export function yearTagEncoded(year) {
  return `publication+dates%40%40year%40%40${year}`;
}

/** Encode one facet value for tag= (spaces as +, UTF-8 percent-encoding). */
export function encodeFacetValue(s) {
  return encodeURIComponent(String(s ?? "")).replace(/%20/g, "+");
}

/**
 * Lions Award Category facet: level2 (sector group) + level3 (subcategory line).
 * Chained after year tag with ## (%23%23).
 */
export function lionsAwardCategoryFacetEncoded(level2, level3) {
  const v2 = encodeFacetValue(level2);
  const v3 = encodeFacetValue(level3);
  return `lions+award+category%40%40${v2}%40%40${v3}`;
}

/** Year + subcategory facet (for hero entry count on filtered hub). */
export function yearPlusSubcategoryTagEncoded(year, level2, level3) {
  return `${yearTagEncoded(year)}%23%23${lionsAwardCategoryFacetEncoded(level2, level3)}`;
}

export function hubWinnersShortlistsUrl(slug, tagEncoded) {
  return `https://www.lovethework.com/en/awards/winners-shortlists/cannes-lions/${slug}?tag=${tagEncoded}`;
}
