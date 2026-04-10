/**
 * Derive a coarse "network" key from LoveThework `entrant` strings.
 * Uses the first listed shop before " / " (multi-agency credits); otherwise full trimmed string.
 */
export function networkKeyFromEntrant(entrant) {
  const s = String(entrant ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "UNKNOWN";
  const first = s.split(/\s*\/\s*/)[0].trim();
  return first || "UNKNOWN";
}
