"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { analysisApi, ApiError } from "@/lib/api";
import { AnalysisJob } from "@/types/api";
import { isUnauthorizedApiError } from "@/lib/auth-api-errors";
import { getBackendAuthToken } from "@/lib/clerk-backend-token";
import { useAuthApiFailureHandler } from "@/hooks/use-auth-api-failure";

export const ANALYSIS_QUERY_KEYS = {
  /** Scope all keys by Clerk user id — required so caches never leak across sign-out / account switch. */
  root: (userId: string | null | undefined) =>
    ["analysis", userId ?? "__signed_out__"] as const,
  status: (userId: string | null | undefined, jobId: string) =>
    [...ANALYSIS_QUERY_KEYS.root(userId), "status", jobId] as const,
  result: (userId: string | null | undefined, jobId: string) =>
    [...ANALYSIS_QUERY_KEYS.root(userId), "result", jobId] as const,
  gapResult: (userId: string | null | undefined, jobId: string) =>
    [...ANALYSIS_QUERY_KEYS.root(userId), "gap-result", jobId] as const,
  history: (userId: string | null | undefined) =>
    [...ANALYSIS_QUERY_KEYS.root(userId), "history"] as const,
};

export function useCreateAnalysis() {
  const queryClient = useQueryClient();
  const { getToken, userId } = useAuth();
  const onAuthFailure = useAuthApiFailureHandler();

  return useMutation({
    mutationFn: async ({
      baselineFile,
      renewalFile,
      metadata,
    }: {
      baselineFile: File;
      renewalFile: File;
      metadata?: { company_name?: string; policy_type?: string };
    }) => {
      try {
        const uploadToken = await getBackendAuthToken(getToken);
        const { baseline_s3_key, renewal_s3_key } = await analysisApi.uploadFiles(
          baselineFile,
          renewalFile,
          uploadToken
        );

        const createToken = await getBackendAuthToken(getToken);
        return analysisApi.createAnalysis(
          baseline_s3_key,
          renewal_s3_key,
          metadata,
          createToken
        );
      } catch (e) {
        await onAuthFailure(e);
        throw e;
      }
    },
    onSuccess: async (data: AnalysisJob) => {
      queryClient.setQueryData(
        ANALYSIS_QUERY_KEYS.status(userId, data.job_id),
        data
      );
      await queryClient.invalidateQueries({
        queryKey: ANALYSIS_QUERY_KEYS.root(userId),
        refetchType: "active",
      });
    },
  });
}

export function useAnalysisStatus(jobId: string, enabled = true) {
  const { getToken, userId, isLoaded, isSignedIn } = useAuth();
  const authReady =
    isLoaded && isSignedIn === true && !!userId;
  const onAuthFailure = useAuthApiFailureHandler();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.status(userId, jobId),
    queryFn: async () => {
      try {
        const token = await getBackendAuthToken(getToken);
        return analysisApi.getAnalysisStatus(jobId, token);
      } catch (e) {
        await onAuthFailure(e);
        throw e;
      }
    },
    /** Wait for a fully signed-in session so getToken() is valid. */
    enabled: enabled && !!jobId && authReady,
    refetchInterval: (query) => {
      if (query.state.error && isUnauthorizedApiError(query.state.error)) {
        return false;
      }
      const status = query.state.data?.status;

      // Stop polling only when we reach a terminal state
      if (status === "completed" || status === "failed") {
        return false;
      }

      // Keep polling for pending, processing, or any other state
      return 3000;
    },
    refetchIntervalInBackground: true,
  });
}

export function useAnalysisResult(jobId: string, enabled = true, poll = false) {
  const { getToken, userId, isLoaded, isSignedIn } = useAuth();
  const authReady =
    isLoaded && isSignedIn === true && !!userId;
  const onAuthFailure = useAuthApiFailureHandler();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.result(userId, jobId),
    queryFn: async () => {
      try {
        const token = await getBackendAuthToken(getToken);
        return analysisApi.getAnalysisResult(jobId, token);
      } catch (e) {
        await onAuthFailure(e);
        throw e;
      }
    },
    enabled: enabled && !!jobId && authReady,
    staleTime: 5 * 60 * 1000, // Results are stable for 5 minutes
    refetchInterval: (query) => {
      if (query.state.error && isUnauthorizedApiError(query.state.error)) {
        return false;
      }
      return poll ? 2000 : false;
    },
    retry: (failureCount, error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return false;
      if (!poll) return false;
      return failureCount < 3;
    },
  });
}

export function useAnalysisHistory() {
  const { getToken, userId, isLoaded, isSignedIn } = useAuth();
  const authReady =
    isLoaded && isSignedIn === true && !!userId;
  const onAuthFailure = useAuthApiFailureHandler();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.history(userId),
    queryFn: async () => {
      try {
        const token = await getBackendAuthToken(getToken);
        return analysisApi.getAnalysisHistory(token);
      } catch (e) {
        await onAuthFailure(e);
        throw e;
      }
    },
    enabled: authReady,
    staleTime: 60 * 1000, // History is stable for 1 minute
  });
}

export function useCreateGapAnalysis() {
  const queryClient = useQueryClient();
  const { getToken, userId } = useAuth();
  const onAuthFailure = useAuthApiFailureHandler();

  return useMutation({
    mutationFn: async ({
      policyFile,
      riskProfile,
      businessLocations,
    }: {
      policyFile: File;
      riskProfile: Record<string, unknown>;
      businessLocations?: Array<{ address: string; isPrimary: boolean }>;
    }) => {
      try {
        const uploadToken = await getBackendAuthToken(getToken);
        const s3Key = await analysisApi.uploadSingleFile(policyFile, uploadToken);

        const createToken = await getBackendAuthToken(getToken);
        return analysisApi.createGapAnalysis(
          s3Key,
          riskProfile,
          createToken,
          businessLocations
        );
      } catch (e) {
        await onAuthFailure(e);
        throw e;
      }
    },
    onSuccess: async (data: AnalysisJob) => {
      queryClient.setQueryData(
        ANALYSIS_QUERY_KEYS.status(userId, data.job_id),
        data
      );
      await queryClient.invalidateQueries({
        queryKey: ANALYSIS_QUERY_KEYS.root(userId),
        refetchType: "active",
      });
    },
  });
}

export function useGapAnalysisResult(
  jobId: string,
  enabled = true,
  /** Poll and retry until the gap result exists (analysis page + dashboard right after redirect). */
  pollUntilLoaded = false
) {
  const { getToken, userId, isLoaded, isSignedIn } = useAuth();
  const authReady =
    isLoaded && isSignedIn === true && !!userId;
  const onAuthFailure = useAuthApiFailureHandler();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.gapResult(userId, jobId),
    queryFn: async () => {
      try {
        const token = await getBackendAuthToken(getToken);
        return analysisApi.getGapAnalysisResult(jobId, token);
      } catch (e) {
        await onAuthFailure(e);
        throw e;
      }
    },
    enabled: enabled && !!jobId && authReady,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      if (query.state.error && isUnauthorizedApiError(query.state.error)) {
        return false;
      }
      if (!pollUntilLoaded || !enabled || !jobId) return false;
      if (query.state.data) return false;
      return 2000;
    },
    retry: (failureCount, error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return false;
      const status =
        error instanceof ApiError ? error.status : undefined;
      if (status === 404 && failureCount < 12) return true;
      return failureCount < 4;
    },
    retryDelay: (attemptIndex) =>
      Math.min(500 * 2 ** attemptIndex, 8000),
  });
}
