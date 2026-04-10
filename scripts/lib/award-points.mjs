/**
 * Map a cannes_lovethework.jsonl row to points using the user's scheme.
 * @returns {{ points: number, rule: string } | { points: null, rule: string, reason?: string }}
 */
export function pointsForRecord(rec) {
  const prize = normalizeWs(String(rec.prize ?? ""));
  const award = normalizeWs(String(rec.award ?? ""));
  const lion = normalizeWs(String(rec.lion_category ?? ""));
  const listType = rec.list_type;
  const p = prize.toLowerCase();
  const a = award.toLowerCase();
  const l = lion.toLowerCase();
  const pa = `${prize} ${award}`.toLowerCase();

  if (listType === "shortlist" || a === "shortlist" || p === "shortlist") {
    return { points: 1, rule: "shortlist" };
  }

  // 50: Titanium Grand Prix (wording) OR Grand Prix while in Titanium Lions OR Creative Effectiveness Lions
  if (/\btitanium\s+grand\s+prix\b/i.test(pa) || /\btitanium\s+grand\s+prix\b/i.test(lion)) {
    return { points: 50, rule: "titanium_grand_prix_explicit" };
  }
  if (l.includes("titanium lions") && /\bgrand\s+prix\b/i.test(pa)) {
    return { points: 50, rule: "titanium_lions_grand_prix" };
  }
  if (l.includes("creative effectiveness lions") && /\bgrand\s+prix\b/i.test(pa)) {
    return { points: 50, rule: "creative_effectiveness_grand_prix" };
  }

  // 40: any other Grand Prix (incl. Grand Prix for Good)
  if (/\bgrand\s+prix\b/i.test(pa)) {
    return { points: 40, rule: "grand_prix_other" };
  }

  // 40: Titanium Lion (non–Grand Prix)
  if (/\btitanium\s+lion\b/i.test(prize) && !/\bgrand\b/i.test(prize)) {
    return { points: 40, rule: "titanium_lion" };
  }

  // Metals (Campaign variants count same as metal) — use prize and award
  const metalSource = `${prize} ${award}`;
  if (/\bgold\b/i.test(metalSource)) return { points: 20, rule: "gold" };
  if (/\bsilver\b/i.test(metalSource)) return { points: 10, rule: "silver" };
  if (/\bbronze\b/i.test(metalSource)) return { points: 5, rule: "bronze" };


  // Special Lions not named in the base scheme (Innovation / Product Design / Glass) — treated as Gold equivalent (20) until specified otherwise.
  if (/\b(innovation lion|product design lion|glass lion)\b/i.test(metalSource)) {
    return { points: 20, rule: "special_lion_gold_equivalent" };
  }

  return { points: null, rule: "unknown", reason: "unmatched_prize_or_award" };
}

function normalizeWs(s) {
  return s.replace(/\s+/g, " ").trim();
}
