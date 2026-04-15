"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { analysisApi, ApiError } from "@/lib/api";
import { AnalysisJob } from "@/types/api";

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
      const token = await getToken();

      const { baseline_s3_key, renewal_s3_key } = await analysisApi.uploadFiles(
        baselineFile,
        renewalFile,
        token
      );

      return analysisApi.createAnalysis(
        baseline_s3_key,
        renewal_s3_key,
        metadata,
        token
      );
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
  const { getToken, isLoaded, userId } = useAuth();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.status(userId, jobId),
    queryFn: async () => {
      const token = await getToken();
      return analysisApi.getAnalysisStatus(jobId, token);
    },
    /** Wait for session + user id so getToken() is valid (avoids failed polls right after navigation). */
    enabled: enabled && !!jobId && isLoaded && !!userId,
    refetchInterval: (query) => {
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
  const { getToken, isLoaded, userId } = useAuth();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.result(userId, jobId),
    queryFn: async () => {
      const token = await getToken();
      return analysisApi.getAnalysisResult(jobId, token);
    },
    enabled: enabled && !!jobId && isLoaded && !!userId,
    staleTime: 5 * 60 * 1000, // Results are stable for 5 minutes
    refetchInterval: poll ? 2000 : false, // Poll every 2 seconds when poll is true
    retry: poll ? 3 : false, // Retry failed requests when polling
  });
}

export function useAnalysisHistory() {
  const { getToken, isLoaded, userId } = useAuth();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.history(userId),
    queryFn: async () => {
      const token = await getToken();
      return analysisApi.getAnalysisHistory(token);
    },
    enabled: isLoaded && !!userId,
    staleTime: 60 * 1000, // History is stable for 1 minute
  });
}

export function useCreateGapAnalysis() {
  const queryClient = useQueryClient();
  const { getToken, userId } = useAuth();

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
      const token = await getToken();

      const s3Key = await analysisApi.uploadSingleFile(policyFile, token);

      return analysisApi.createGapAnalysis(s3Key, riskProfile, token, businessLocations);
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
  const { getToken, isLoaded, userId } = useAuth();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.gapResult(userId, jobId),
    queryFn: async () => {
      const token = await getToken();
      return analysisApi.getGapAnalysisResult(jobId, token);
    },
    enabled: enabled && !!jobId && isLoaded && !!userId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      if (!pollUntilLoaded || !enabled || !jobId) return false;
      if (query.state.data) return false;
      return 2000;
    },
    retry: (failureCount, error: unknown) => {
      const status =
        error instanceof ApiError ? error.status : undefined;
      if (status === 404 && failureCount < 12) return true;
      return failureCount < 4;
    },
    retryDelay: (attemptIndex) =>
      Math.min(500 * 2 ** attemptIndex, 8000),
  });
}