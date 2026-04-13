/**
 * Parse Love The Work winners-shortlists hub HTML (Next.js RSC flight) for
 * "Unawarded" filtered views. Entry rows live in `basicCardsProps` JSON arrays
 * (see flight chunks: children with searchContentType "Entry").
 *
 * Card shape (per row):
 * - title.text → work name
 * - subText → subcategory entered
 * - supportText → agency line
 * - url → /work/entries/... (absolute URL prepended by scraper)
 */

import { normalizeText, readJsStringLiteral } from "./extract-awards-payload.mjs";

export { normalizeText };

/** @typedef {{ work_name: string, subcategory: string, agency: string, entry_url: string | null }} UnawardedRow */

/**
 * Parse `totalCount`, `pageSize`, `pageNumber` from raw HTML (searchResults block).
 * @returns {{ totalCount: number, pageSize: number, pageNumber: number } | null}
 */
export function extractSearchPaginationMeta(html) {
  /** RSC HTML escapes inner JSON quotes as \". */
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
 * Given decoded flight inner string, find `basicCardsProps` and parse the JSON array that follows.
 * Returns all arrays found in this chunk (usually one).
 */
function parseBasicCardsArraysFromInner(inner) {
  const key = "basicCardsProps";
  const out = [];
  let pos = 0;
  while ((pos = inner.indexOf(key, pos)) !== -1) {
    let i = pos + key.length;
    while (i < inner.length && inner[i] !== "[") i++;
    if (inner[i] !== "[") {
      pos += key.length;
      continue;
    }
    const start = i;
    let depth = 0;
    let j = start;
    for (; j < inner.length; j++) {
      const c = inner[j];
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    try {
      const arr = JSON.parse(inner.slice(start, j));
      if (Array.isArray(arr)) out.push(arr);
    } catch {
      /* skip malformed */
    }
    pos = j;
  }
  return out;
}

/**
 * Extract all basic card entries from full hub HTML (all flight chunks).
 * @returns {Array<Record<string, unknown>>}
 */
export function extractBasicCardsRaw(html) {
  const parts = html.split("self.__next_f.push");
  const merged = [];
  const head = '([1,"';

  for (const part of parts) {
    const hi = part.indexOf(head);
    if (hi !== 0) continue;
    let inner;
    try {
      inner = readJsStringLiteral(part, hi + head.length - 1).value;
    } catch {
      continue;
    }
    const arrays = parseBasicCardsArraysFromInner(inner);
    for (const arr of arrays) {
      for (const card of arr) {
        if (!card || typeof card !== "object") continue;
        if (card.searchContentType !== "Entry") continue;
        merged.push(card);
      }
    }
  }
  return merged;
}

/**
 * Map basic cards to output rows.
 * @param {Array<Record<string, unknown>>} cards
 * @returns {UnawardedRow[]}
 */
export function basicCardsToRows(cards) {
  const rows = [];
  for (const card of cards) {
    const title = card.title;
    const text =
      title && typeof title === "object" && title.text != null
        ? normalizeText(String(title.text))
        : "";
    const sub = normalizeText(
      card.subText != null ? String(card.subText) : "",
    );
    const agency = normalizeText(
      card.supportText != null ? String(card.supportText) : "",
    );
    let entry_url = null;
    if (typeof card.url === "string" && card.url.startsWith("/")) {
      entry_url = `https://www.lovethework.com${card.url}`;
    } else if (typeof card.url === "string" && card.url.startsWith("http")) {
      entry_url = card.url;
    }
    rows.push({
      work_name: text,
      subcategory: sub,
      agency,
      entry_url,
    });
  }
  return rows;
}

/**
 * Full parse: HTML → rows for one page response.
 * @returns {{ rows: UnawardedRow[], meta: ReturnType<typeof extractSearchPaginationMeta> }}
 */
export function extractUnawardedPage(html) {
  const meta = extractSearchPaginationMeta(html);
  const raw = extractBasicCardsRaw(html);
  const rows = basicCardsToRows(raw);
  return { rows, meta };
}
