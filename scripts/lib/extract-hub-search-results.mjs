/**
 * Parse Love The Work winners-shortlists hub HTML for embedded `searchResults`
 * (totalCount, pageSize, documents with tags including Lions Award Category).
 *
 * RSC payloads double-escape JSON; we use regex on the raw HTML for reliable
 * `totalCount` and Lions Award Category tag triples.
 */

/** Decode a JSON string literal fragment from RSC (handles \\uXXXX, \", etc.). */
function decodeJsonStringFragment(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}

/**
 * @returns {{ totalCount: number, pageSize: number, pageNumber: number } | null}
 */
export function extractSearchPaginationFromHtml(html) {
  const m =
    html.match(/\\"totalCount\\":(\d+),\\"pageSize\\":(\d+),\\"pageNumber\\":(\d+)/) ||
    html.match(/"totalCount":(\d+),"pageSize":(\d+),"pageNumber":(\d+)/);
  if (!m) return null;
  return {
    totalCount: parseInt(m[1], 10),
    pageSize: parseInt(m[2], 10),
    pageNumber: parseInt(m[3], 10),
  };
}

/**
 * Unique (level2, level3) pairs for "Lions Award Category" from one HTML response.
 * @returns {Array<{ level2: string, level3: string }>}
 */
export function extractLionsAwardCategoryFacetPairs(html) {
  const re =
    /\\"level1\\":\\"Lions Award Category\\",\\"level2\\":\\"((?:[^\\]|\\.)*?)\\",\\"level3\\":\\"((?:[^\\]|\\.)*?)\\"/g;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    let level2 = decodeJsonStringFragment(m[1]);
    let level3 = decodeJsonStringFragment(m[2]);
    level2 = String(level2).trim();
    level3 = String(level3).trim();
    if (!level3) continue;
    const key = `${level2}\u0000${level3}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ level2, level3 });
  }
  return out;
}
