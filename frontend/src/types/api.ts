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
  status: "processing" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  baseline_filename: string;
  renewal_filename: string;
  estimated_completion_time?: string;
  error_message?: string;
}

export interface CoverageGap {
  type: string;
  status: "covered" | "not_covered";
  title: string;
  explanation: string;
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