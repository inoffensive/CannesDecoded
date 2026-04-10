/**
 * Extract Cannes results payload from Next.js RSC flight HTML (shared by scrapers).
 */

/** The Work sometimes stores HTML unicode escapes as literal `u0026` in strings. */
export function normalizeText(s) {
  if (s == null || typeof s !== "string") return s;
  return s.replace(/u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
}

/** Read a double-quoted JS string literal starting at opening ". */
export function readJsStringLiteral(source, from) {
  if (source[from] !== '"') throw new Error("expected opening quote");
  let i = from + 1;
  let out = "";
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") {
      i++;
      const n = source[i];
      if (n === undefined) break;
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "r") out += "\r";
      else out += n;
      i++;
      continue;
    }
    if (c === '"') return { value: out, endExclusive: i + 1 };
    out += c;
    i++;
  }
  throw new Error("unterminated string");
}

/**
 * Extract props object { category, year, festivalName, winners, shortlists }
 * from Next.js flight HTML.
 */
export function extractAwardsPayload(html) {
  const parts = html.split("self.__next_f.push");
  for (const part of parts) {
    const head = '([1,"';
    const hi = part.indexOf(head);
    if (hi !== 0) continue;
    let inner;
    try {
      inner = readJsStringLiteral(part, hi + head.length - 1).value;
    } catch {
      continue;
    }
    if (!inner.includes('"winners":') || !inner.includes('"shortlists":')) continue;
    const marker = 'null,{"category"';
    const mi = inner.indexOf(marker);
    if (mi < 0) continue;
    const jsonStart = mi + "null,".length;
    let depth = 0;
    let j = jsonStart;
    for (; j < inner.length; j++) {
      const c = inner[j];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const jsonStr = inner.slice(jsonStart, j + 1);
    try {
      const payload = JSON.parse(jsonStr);
      if (!Array.isArray(payload?.winners) || !Array.isArray(payload?.shortlists)) {
        continue;
      }
      return payload;
    } catch {
      continue;
    }
  }
  return null;
}

export function isCannesLionsResults(payload) {
  if (!payload) return false;
  if (!Array.isArray(payload.winners) || !Array.isArray(payload.shortlists)) {
    return false;
  }
  return normalizeText(payload.festivalName || "") === "Cannes Lions";
}
