/**
 * Hero "N[,N]... Entries" on winners-shortlists hub pages.
 * Same logic as scrape-cannes-category-entry-counts.mjs.
 */
export function parseEntryCount(html) {
  const lower = html.toLowerCase();
  const mainIdx = lower.indexOf("<main");
  const slice = mainIdx >= 0 ? html.slice(mainIdx) : html;
  const matches = [...slice.matchAll(/([\d,]+)\s*Entries/gi)];
  if (!matches.length) return null;
  const nums = matches.map((m) => parseInt(m[1].replace(/,/g, ""), 10));
  const freq = new Map();
  for (const n of nums) {
    if (!Number.isFinite(n) || n < 0) continue;
    freq.set(n, (freq.get(n) ?? 0) + 1);
  }
  let bestN = nums[0];
  let bestFreq = -1;
  for (const [n, c] of freq) {
    if (c > bestFreq || (c === bestFreq && n < bestN)) {
      bestFreq = c;
      bestN = n;
    }
  }
  return bestN;
}
