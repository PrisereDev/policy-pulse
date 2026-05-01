/**
 * Always mint a fresh JWT for backend calls. Clerk may cache tokens in memory;
 * skipCache avoids sending an expired session token after long uploads, tab sleep,
 * or background refetches.
 */
export async function getBackendAuthToken(
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>
): Promise<string | null> {
  return getToken({ skipCache: true });
}
