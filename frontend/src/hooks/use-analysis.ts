"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { analysisApi } from "@/lib/api";
import { AnalysisJob } from "@/types/api";

export const ANALYSIS_QUERY_KEYS = {
  all: ["analysis"] as const,
  status: (jobId: string) => [...ANALYSIS_QUERY_KEYS.all, "status", jobId] as const,
  result: (jobId: string) => [...ANALYSIS_QUERY_KEYS.all, "result", jobId] as const,
  history: () => [...ANALYSIS_QUERY_KEYS.all, "history"] as const,
};

export function useCreateAnalysis() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

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
    onSuccess: (data: AnalysisJob) => {
      // Cache the new job status
      queryClient.setQueryData(
        ANALYSIS_QUERY_KEYS.status(data.job_id),
        data
      );
      // Invalidate history to refetch
      queryClient.invalidateQueries({
        queryKey: ANALYSIS_QUERY_KEYS.history(),
      });
    },
  });
}

export function useAnalysisStatus(jobId: string, enabled = true) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.status(jobId),
    queryFn: async () => {
      const token = await getToken();
      return analysisApi.getAnalysisStatus(jobId, token);
    },
    enabled: enabled && !!jobId,
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
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.result(jobId),
    queryFn: async () => {
      const token = await getToken();
      return analysisApi.getAnalysisResult(jobId, token);
    },
    enabled: enabled && !!jobId,
    staleTime: 5 * 60 * 1000, // Results are stable for 5 minutes
    refetchInterval: poll ? 2000 : false, // Poll every 2 seconds when poll is true
    retry: poll ? 3 : false, // Retry failed requests when polling
  });
}

export function useAnalysisHistory() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.history(),
    queryFn: async () => {
      const token = await getToken();
      return analysisApi.getAnalysisHistory(token);
    },
    staleTime: 60 * 1000, // History is stable for 1 minute
  });
}