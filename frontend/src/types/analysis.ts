export type ChangeType = "increased" | "decreased" | "modified" | "added" | "removed";

export type ChangeCategory = 
  | "coverage_limit" 
  | "deductible" 
  | "exclusion" 
  | "premium" 
  | "terms_conditions"
  | "other";

export interface PolicyChange {
  id: string;
  category: ChangeCategory;
  change_type: ChangeType;
  title: string;
  description: string;
  baseline_value: string;
  renewal_value: string;
  change_amount?: string;
  percentage_change?: number;
  confidence: number;
  page_references: {
    baseline: number[];
    renewal: number[];
  };
  /** When present (from AI), lists addresses affected by this change */
  affected_locations?: string[];
}

export interface SuggestedAction {
  category: ChangeCategory;
  action: string;
  educational_context: string;
}

export interface EducationalInsight {
  change_type: string;
  insight: string;
}

export interface PremiumComparison {
  baseline_premium: number | null;
  renewal_premium: number | null;
  difference: number | null;
  percentage_change: number | null;
}

export interface AnalysisSummary {
  total_changes: number;
  change_categories: Record<ChangeCategory, number>;
}

export interface AnalysisResult {
  job_id: string;
  status: "processing" | "completed" | "failed";
  summary: AnalysisSummary;
  changes: PolicyChange[];
  premium_comparison: PremiumComparison;
  suggested_actions: SuggestedAction[];
  educational_insights: EducationalInsight[];
  metadata: {
    analysis_version: string;
    model_version: string;
    processing_time_seconds: number;
    completed_at: string;
  };
}

export interface JobStatus {
  job_id: string;
  status: "processing" | "completed" | "failed";
  progress: number;
  message: string;
  updated_at: string;
}

export interface UploadSession {
  upload_urls: Array<{
    url: string;
    key: string;
    expires_at: string;
  }>;
}