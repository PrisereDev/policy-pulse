/**
 * After "Skip for now" on /onboarding/upload, we persist intent so the gap-first
 * dashboard shows even when the user already has older analysis rows in the API.
 */
export const PRISERE_SKIP_GAP_UPLOAD_KEY = "prisere_skip_gap_upload_v1";

export function setSkipGapUploadIntent(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PRISERE_SKIP_GAP_UPLOAD_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearSkipGapUploadIntent(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PRISERE_SKIP_GAP_UPLOAD_KEY);
  } catch {
    /* ignore */
  }
}

export function readSkipGapUploadIntent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(PRISERE_SKIP_GAP_UPLOAD_KEY) === "1";
  } catch {
    return false;
  }
}
