/**
 * Resolves the label for **coverage gap analysis**: prefer the insured/business
 * name extracted from the policy by the model; if none, use "{User}'s Business"
 * from the signed-in Clerk user, then a generic placeholder.
 */

export const BUSINESS_DISPLAY_PLACEHOLDER = "Your Business";

type UserLike = {
  firstName?: string | null;
  fullName?: string | null;
  username?: string | null;
} | null | undefined;

/** When the policy did not yield a company name — first name, full name, username. */
export function accountFallbackBusinessLabel(user: UserLike): string {
  const first = user?.firstName?.trim();
  if (first) return `${first}'s Business`;
  const full = typeof user?.fullName === "string" ? user.fullName.trim() : "";
  if (full) return `${full}'s Business`;
  const un = typeof user?.username === "string" ? user.username.trim() : "";
  if (un) return `${un}'s Business`;
  return BUSINESS_DISPLAY_PLACEHOLDER;
}

/**
 * @param policyBusinessName — `business_name` from gap analysis API (policy extraction only).
 */
export function resolveBusinessDisplayName(
  policyBusinessName: string | null | undefined,
  user: UserLike
): { label: string; isPlaceholder: boolean } {
  const fromPolicy = policyBusinessName?.trim();
  if (fromPolicy) {
    return { label: fromPolicy, isPlaceholder: false };
  }

  return {
    label: accountFallbackBusinessLabel(user),
    isPlaceholder: true,
  };
}
