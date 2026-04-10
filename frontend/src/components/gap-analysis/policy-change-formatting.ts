import type { PolicyChange } from "@/types/analysis";

export function formatChangeBadgeLabel(change: PolicyChange): string {
  switch (change.change_type) {
    case "increased":
      return "Increased";
    case "decreased":
      return "Decreased";
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    default:
      return "Modified";
  }
}

/** Static badge (PDF / print — no hover) */
export function policyChangeBadgeClass(change: PolicyChange): string {
  const t = change.change_type;
  if (t === "added") {
    return "bg-prisere-teal/10 text-prisere-teal border border-prisere-teal/30 font-normal";
  }
  if (t === "modified") {
    return "bg-gray-100 text-gray-700 border border-gray-200 font-normal";
  }
  return "bg-rose-100/90 text-prisere-maroon border border-rose-200/80 font-normal";
}

/** Interactive card badge (hover states) */
export function policyChangeBadgeClassInteractive(change: PolicyChange): string {
  const t = change.change_type;
  if (t === "added") {
    return "bg-prisere-teal/10 text-prisere-teal border-prisere-teal/30 hover:bg-prisere-teal/10 font-normal";
  }
  if (t === "modified") {
    return "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100 font-normal";
  }
  return "bg-rose-100/90 text-prisere-maroon border-rose-200/80 hover:bg-rose-100/90 font-normal";
}

export function renewalValueClass(change: PolicyChange): string {
  if (change.change_type === "added") return "text-prisere-teal font-semibold";
  if (change.change_type === "modified") return "text-prisere-dark-gray font-semibold";
  return "text-prisere-maroon font-semibold";
}

export function getChangeTone(change: PolicyChange): "bad" | "good" | "neutral" {
  const { category, change_type } = change;
  if (category === "exclusion") {
    if (change_type === "added") return "bad";
    if (change_type === "removed") return "good";
  }
  if (change_type === "added") return "good";
  if (change_type === "removed") return "bad";
  if (category === "coverage_limit" && change_type === "decreased") return "bad";
  if (category === "coverage_limit" && change_type === "increased") return "good";
  if (category === "deductible" && change_type === "increased") return "bad";
  if (category === "deductible" && change_type === "decreased") return "good";
  if (category === "premium" && change_type === "increased") return "bad";
  if (category === "premium" && change_type === "decreased") return "good";
  return "neutral";
}

export function computeRenewalDisplay(change: PolicyChange): string {
  if (
    change.change_amount?.trim() &&
    change.renewal_value &&
    !change.renewal_value.includes(change.change_amount)
  ) {
    return `${change.renewal_value} (${change.change_amount})`;
  }
  return change.renewal_value;
}
