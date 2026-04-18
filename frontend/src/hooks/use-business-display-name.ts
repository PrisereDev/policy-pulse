"use client";

import { useUser } from "@clerk/nextjs";
import { useMemo } from "react";
import { useAnalysisHistory, useGapAnalysisResult } from "@/hooks/use-analysis";
import type { AnalysisJob } from "@/types/api";
import { resolveBusinessDisplayName } from "@/lib/business-display-name";

function isGapAnalysisJob(a: AnalysisJob): boolean {
  return !a.renewal_filename || String(a.renewal_filename).trim() === "";
}

/**
 * Business label for headers: named insured from the latest completed gap
 * analysis when present; otherwise "{first}'s Business" or "Your Business".
 */
export function useBusinessDisplayName() {
  const { user } = useUser();
  const { data: analyses = [] } = useAnalysisHistory();

  const latestGapJob = useMemo(() => {
    const completedGaps = analyses.filter(
      (a) => a.status === "completed" && isGapAnalysisJob(a)
    );
    if (completedGaps.length === 0) return undefined;
    return [...completedGaps].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [analyses]);

  const gapJobId = latestGapJob?.job_id ?? "";
  const { data: gapResult } = useGapAnalysisResult(gapJobId, !!gapJobId, true);

  return useMemo(
    () => resolveBusinessDisplayName(gapResult?.business_name, user),
    [gapResult?.business_name, user]
  );
}
