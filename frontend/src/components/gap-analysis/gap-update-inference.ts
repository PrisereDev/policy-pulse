import type { CoverageGap } from "@/types/api";
import type { PolicyChange } from "@/types/analysis";

/** Keywords to associate a gap type with renewal change text */
const GAP_TYPE_KEYWORDS: Record<string, string[]> = {
  flood: ["flood"],
  spoilage: ["spoilage", "refrigeration", "utility", "electrical interruption"],
  event_cancellation: ["event cancellation", "cancellation"],
  eo: ["errors & omissions", "e&o", "professional liability"],
  cyber: ["cyber", "data breach", "privacy"],
};

/**
 * Infer whether a prior gap appears addressed by renewal policy changes.
 * Uses keyword overlap plus positive change signals (added / increased coverage).
 */
export function inferGapUpdateStatus(
  gap: CoverageGap,
  changes: PolicyChange[]
): "still_not_covered" | "now_covered" {
  if (gap.status === "covered") return "now_covered";

  const typeKeys = GAP_TYPE_KEYWORDS[gap.type] ?? [];
  const titleLower = gap.title.toLowerCase();
  const needles = [...typeKeys, titleLower].filter(Boolean);

  for (const ch of changes) {
    const blob = `${ch.title} ${ch.description} ${ch.baseline_value} ${ch.renewal_value}`.toLowerCase();
    const matchesGap = needles.some((n) => n.length > 1 && blob.includes(n));
    if (!matchesGap) continue;

    const addedOrBetter =
      ch.change_type === "added" ||
      (ch.change_type === "increased" &&
        (ch.category === "coverage_limit" ||
          ch.category === "other" ||
          blob.includes("limit")));

    if (addedOrBetter) return "now_covered";
  }

  return "still_not_covered";
}

export function countGapsNewlyCovered(
  gaps: CoverageGap[],
  changes: PolicyChange[]
): number {
  return gaps.filter(
    (g) => g.status === "not_covered" && inferGapUpdateStatus(g, changes) === "now_covered"
  ).length;
}
