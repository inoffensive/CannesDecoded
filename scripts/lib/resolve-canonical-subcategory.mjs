/**
 * Map Love The Work hub short subcategory labels (e.g. "Sound Design") to
 * canonical Cannes labels with track codes (e.g. "B02 - Sound Design") using
 * the keys from category-details `probabilities.bySubcategory` for that slug.
 *
 * Resolution order: prefixed hub text → exact suffix → case-insensitive suffix
 * → normalized suffix → fuzzy (unique best Levenshtein) → curated aliases
 * (global + bySlug).
 */

/** Already looks like "B02 - Sound Design" */
const HAS_PREFIX_RE = /^[A-Z]\d{2}\s*-\s*.+/;

/**
 * Lowercase, unify ampersand, collapse whitespace, soften slashes for compare.
 * @param {string} s
 */
export function normalizeHubCompare(s) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} full - "B02 - Sound Design"
 * @returns {{ code: string, suffix: string } | null}
 */
function splitCanonical(full) {
  const m = (full ?? "").match(/^([A-Z]\d{2})\s*-\s*(.+)$/);
  if (!m) return null;
  return { code: m[1], suffix: m[2].trim() };
}

/** @param {string} a @param {string} b */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  /** @type {number[]} */
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1);
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Pick alias target: full canonical string, or suffix-only match within labels.
 * @param {string} raw
 * @param {string[]} canonicalLabels
 * @returns {string | null}
 */
function resolveAliasTarget(raw, canonicalLabels) {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (canonicalLabels.includes(v)) return v;
  const exactSuffix = resolveCanonicalSubcategory(v, canonicalLabels, {
    skipAliases: true,
    skipFuzzy: true,
  });
  if (exactSuffix.matched) return exactSuffix.subcategory;
  const nv = normalizeHubCompare(v);
  for (const full of canonicalLabels) {
    const sp = splitCanonical(full);
    if (!sp) continue;
    if (normalizeHubCompare(sp.suffix) === nv) return full;
  }
  return null;
}

/**
 * @param {string} hubSub - Value from hub card `subText`
 * @param {string[]} canonicalLabels - e.g. Object.keys(bySubcategory) from category-details
 * @param {object} [opts]
 * @param {boolean} [opts.skipFuzzy]
 * @param {boolean} [opts.skipAliases]
 * @param {string} [opts.slug] - category slug for alias lookup
 * @param {{ global?: Record<string, string>, bySlug?: Record<string, Record<string, string>> } | null} [opts.aliases]
 * @returns {{ subcategory: string, matched: boolean, via?: 'exact'|'case'|'normalized'|'fuzzy'|'alias' }}
 */
export function resolveCanonicalSubcategory(hubSub, canonicalLabels, opts = {}) {
  const {
    skipFuzzy = false,
    skipAliases = false,
    slug = "",
    aliases = null,
  } = opts;

  const raw = (hubSub ?? "").trim();
  if (!raw) return { subcategory: "", matched: false };
  if (HAS_PREFIX_RE.test(raw)) {
    return { subcategory: raw, matched: true, via: "exact" };
  }
  if (!canonicalLabels?.length) {
    return { subcategory: raw, matched: false };
  }

  /** @type {Array<{ full: string, suffix: string, suffixNorm: string }>} */
  const parsed = [];
  for (const full of canonicalLabels) {
    const sp = splitCanonical(full);
    if (!sp) continue;
    parsed.push({
      full,
      suffix: sp.suffix,
      suffixNorm: normalizeHubCompare(sp.suffix),
    });
  }

  // Exact suffix
  for (const p of parsed) {
    if (p.suffix === raw) {
      return { subcategory: p.full, matched: true, via: "exact" };
    }
  }

  // Case-insensitive suffix
  const rawLower = raw.toLowerCase();
  for (const p of parsed) {
    if (p.suffix.toLowerCase() === rawLower) {
      return { subcategory: p.full, matched: true, via: "case" };
    }
  }

  // Normalized suffix (e.g. "&" vs "and", spacing)
  const rawNorm = normalizeHubCompare(raw);
  if (rawNorm) {
    for (const p of parsed) {
      if (p.suffixNorm === rawNorm) {
        return { subcategory: p.full, matched: true, via: "normalized" };
      }
    }
  }

  // Fuzzy: unique best match within distance threshold
  if (!skipFuzzy && rawNorm.length >= 4) {
    const maxDist =
      rawNorm.length <= 6 ? 1 : rawNorm.length <= 12 ? 2 : 3;
    /** @type {{ full: string, d: number }[]} */
    const candidates = [];
    for (const p of parsed) {
      const d = levenshtein(rawNorm, p.suffixNorm);
      if (d <= maxDist) candidates.push({ full: p.full, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    if (candidates.length === 1) {
      return {
        subcategory: candidates[0].full,
        matched: true,
        via: "fuzzy",
      };
    }
    if (candidates.length > 1 && candidates[0].d < candidates[1].d) {
      return {
        subcategory: candidates[0].full,
        matched: true,
        via: "fuzzy",
      };
    }
  }

  // Curated aliases (global + bySlug[slug])
  if (!skipAliases && aliases) {
    const globalMap = aliases.global && typeof aliases.global === "object"
      ? aliases.global
      : {};
    const slugMap =
      slug &&
      aliases.bySlug &&
      typeof aliases.bySlug === "object" &&
      aliases.bySlug[slug]
        ? aliases.bySlug[slug]
        : {};
    const tryKeys = [raw, rawNorm, normalizeHubCompare(raw)];
    const uniq = [...new Set(tryKeys.filter(Boolean))];
    /** @type {string | undefined} */
    let target;
    for (const k of uniq) {
      if (slugMap[k] !== undefined) {
        target = slugMap[k];
        break;
      }
    }
    if (target === undefined) {
      for (const k of uniq) {
        if (globalMap[k] !== undefined) {
          target = globalMap[k];
          break;
        }
      }
    }
    // Also try slug-only keys with normalized hub (object keys are usually raw strings)
    if (target === undefined) {
      for (const [aliasKey, aliasVal] of Object.entries(slugMap)) {
        if (normalizeHubCompare(aliasKey) === rawNorm) {
          target = aliasVal;
          break;
        }
      }
    }
    if (target === undefined) {
      for (const [aliasKey, aliasVal] of Object.entries(globalMap)) {
        if (normalizeHubCompare(aliasKey) === rawNorm) {
          target = aliasVal;
          break;
        }
      }
    }
    if (target !== undefined) {
      const resolved = resolveAliasTarget(String(target), canonicalLabels);
      if (resolved) {
        return {
          subcategory: resolved,
          matched: true,
          via: "alias",
        };
      }
    }
  }

  return { subcategory: raw, matched: false };
}
