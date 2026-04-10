/**
 * Map points_rule (from award-points.mjs) to aggregate buckets for stats.
 */
export function bucketForRule(rule) {
  if (!rule) return null;
  if (rule === "bronze") return "bronze";
  if (rule === "silver") return "silver";
  if (rule === "gold" || rule === "special_lion_gold_equivalent") return "gold";
  if (
    rule === "grand_prix_other" ||
    rule === "titanium_grand_prix_explicit" ||
    rule === "titanium_lions_grand_prix" ||
    rule === "creative_effectiveness_grand_prix"
  ) {
    return "grandPrix";
  }
  if (rule === "titanium_lion") return "titaniumLion";
  return null;
}
