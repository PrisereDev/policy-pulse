import { ApiError } from "@/lib/api";

export function isUnauthorizedApiError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
