/**
 * Parse canonical gap-analysis `policy_expiration_date` from API.
 * Contract: backend returns YYYY-MM-DD or null.
 */
export function parseGapPolicyExpiry(raw: string | null | undefined): {
  daysAway: number;
  formatted: string;
} | null {
  if (raw == null || !String(raw).trim()) return null;
  const value = String(raw).trim();
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!isoDate) return null;

  const year = Number(isoDate[1]);
  const month = Number(isoDate[2]);
  const day = Number(isoDate[3]);
  const target = new Date(year, month - 1, day);

  // Reject invalid calendar dates like 2025-02-30.
  if (
    target.getFullYear() != year ||
    target.getMonth() != month - 1 ||
    target.getDate() != day
  ) {
    return null;
  }

  if (!Number.isFinite(target.getTime())) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[gap-expiry] Unparseable policy_expiration_date", { raw });
    }
    return null;
  }
  const daysAway = Math.ceil(
    (target.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (!Number.isFinite(daysAway)) return null;
  const formatted = target.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return { daysAway, formatted };
}
