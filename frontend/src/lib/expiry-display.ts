import { parseGapPolicyExpiry } from "@/lib/gap-expiry";

export type ExpiryDisplayStatus =
  | "neutral"
  | "safe"
  | "warning"
  | "urgent"
  | "expired";

/**
 * Calendar days until expiration (negative = expired). Uses the same parsing
 * rules as `parseGapPolicyExpiry` (invalid/missing → null).
 */
export function getDaysUntilExpiry(expirationDate: string | null): number | null {
  const parsed = parseGapPolicyExpiry(expirationDate);
  if (!parsed) return null;
  return parsed.daysAway;
}

/**
 * Copy and status for the dashboard “Until expiry” stat tile.
 */
export function getExpiryDisplay(expirationDate: string | null): {
  topText: string;
  bottomLabel: string;
  status: ExpiryDisplayStatus;
} {
  const days = getDaysUntilExpiry(expirationDate);

  if (days === null) {
    return {
      topText: "-",
      bottomLabel: "UNTIL EXPIRY",
      status: "neutral",
    };
  }

  if (days < 0) {
    const ago = Math.abs(days);
    return {
      topText: ago === 1 ? "1 day ago" : `${ago} days ago`,
      bottomLabel: "EXPIRED",
      status: "expired",
    };
  }

  if (days === 0) {
    return {
      topText: "Today",
      bottomLabel: "EXPIRES",
      status: "urgent",
    };
  }

  const topDays = days === 1 ? "1 day" : `${days} days`;

  let status: Exclude<ExpiryDisplayStatus, "neutral" | "expired">;
  if (days > 120) {
    status = "safe";
  } else if (days > 30) {
    status = "warning";
  } else {
    status = "urgent";
  }

  return {
    topText: topDays,
    bottomLabel: "UNTIL EXPIRY",
    status,
  };
}
