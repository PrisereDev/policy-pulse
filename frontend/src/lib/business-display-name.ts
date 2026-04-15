/**
 * Resolves the business name shown in the app shell: prefer the name extracted
 * from the coverage policy (gap analysis), then Clerk/onboarding profile fields,
 * then "{accountFirstName}'s business" (or username) when the policy had no name.
 */

export const BUSINESS_DISPLAY_PLACEHOLDER = "Your business";

type UserLike = {
  unsafeMetadata?: Record<string, unknown> | null;
  firstName?: string | null;
  username?: string | null;
} | null | undefined;

/** When the policy did not yield a company name — uses first name, then username. */
export function accountFallbackBusinessLabel(user: UserLike): string {
  const first = user?.firstName?.trim();
  if (first) return `${first}'s business`;
  const un = typeof user?.username === "string" ? user.username.trim() : "";
  if (un) return `${un}'s business`;
  return BUSINESS_DISPLAY_PLACEHOLDER;
}

export function resolveBusinessDisplayName(
  policyBusinessName: string | null | undefined,
  user: UserLike
): { label: string; isPlaceholder: boolean } {
  const fromPolicy = policyBusinessName?.trim();
  if (fromPolicy) {
    return { label: fromPolicy, isPlaceholder: false };
  }

  const meta = user?.unsafeMetadata?.businessName;
  if (typeof meta === "string" && meta.trim()) {
    return { label: meta.trim(), isPlaceholder: false };
  }

  const onboarding = user?.unsafeMetadata?.onboardingAnswers as
    | Record<string, unknown>
    | undefined;
  const obName = onboarding?.businessName;
  if (typeof obName === "string" && obName.trim()) {
    return { label: obName.trim(), isPlaceholder: false };
  }

  return {
    label: accountFallbackBusinessLabel(user),
    isPlaceholder: true,
  };
}
