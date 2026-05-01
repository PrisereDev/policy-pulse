// Re-export types from analysis.ts for consistency
export type { 
  AnalysisResult,
  PolicyChange,
  PremiumComparison,
  AnalysisSummary,
  ChangeType,
  ChangeCategory
} from "./analysis";

export interface AnalysisJob {
  job_id: string;
  status: "processing" | "completed" | "failed" | "pending";
  created_at: string;
  updated_at: string;
  baseline_filename: string;
  /** Absent or empty for gap-only (single-policy) analyses */
  renewal_filename?: string | null;
  /** Insured/business name from policy extraction when job is completed gap analysis */
  business_name?: string | null;
  /** 0–100 from GET /analyses/{job_id}/status while the job runs */
  progress?: number | null;
  /** Current step message from the worker */
  message?: string | null;
  estimated_completion_time?: string;
  error_message?: string;
}

export interface CoverageGap {
  type: string;
  status: "covered" | "not_covered";
  title: string;
  explanation: string;
  affected_locations?: string[];
}

export interface GapAnalysisResult {
  job_id: string;
  status: string;
  gaps: CoverageGap[];
  business_name: string | null;
  policy_expiration_date: string | null;
  summary: string;
  recommendations: string[];
  metadata: Record<string, unknown>;
}