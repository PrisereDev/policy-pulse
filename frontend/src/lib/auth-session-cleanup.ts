import type { QueryClient } from "@tanstack/react-query";
import { clearSkipGapUploadIntent } from "@/lib/prisere-dashboard-session";

/** sessionStorage keys used during onboarding (see onboarding/page.tsx, onboarding/upload/page.tsx). */
const ONBOARDING_SESSION_KEYS = [
  "onboardingAnswers",
  "businessLocations",
] as const;

/**
 * Clears client-side state that must not survive sign-out or account deletion:
 * React Query cache (all user-scoped data lives under keys like ["analysis", userId, ...]),
 * onboarding/sessionStorage helpers, and dashboard “skip gap” intent.
 *
 * Call this after `signOut()` if you implement a custom sign-out or delete-account
 * button; the global AuthSessionSync also runs this when the session ends.
 */
export function clearClientAuthState(queryClient: QueryClient): void {
  queryClient.clear();
  clearSkipGapUploadIntent();
  if (typeof window === "undefined") return;
  try {
    for (const key of ONBOARDING_SESSION_KEYS) {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
