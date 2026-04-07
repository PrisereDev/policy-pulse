import { AnalysisJob, AnalysisResult, GapAnalysisResult } from "@/types/api";

const API_BASE_URL = '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** FastAPI often returns `detail` as a string or a validation error list. */
function formatErrorDetail(detail: unknown): string | undefined {
  if (detail == null) return undefined;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (item && typeof item === "object" && "msg" in item) {
        const loc = (item as { loc?: unknown }).loc;
        const msg = String((item as { msg: unknown }).msg);
        if (Array.isArray(loc) && loc.length > 0) {
          return `${loc.join(".")}: ${msg}`;
        }
        return msg;
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    });
    return parts.join("; ");
  }
  if (typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const config: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as {
        detail?: unknown;
        message?: unknown;
        code?: string;
      };
      const msg =
        formatErrorDetail(errorData.detail) ??
        (typeof errorData.message === "string"
          ? errorData.message
          : undefined) ??
        `HTTP ${response.status}: ${response.statusText}`;
      throw new ApiError(msg, response.status, errorData.code);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Network or other errors
    throw new ApiError(
      error instanceof Error ? error.message : "Network error occurred"
    );
  }
}

// Types for upload flow
interface UploadInitResponse {
  upload_url: string;
  fields: Record<string, string>;
  s3_key: string;
  expires_at: string;
  max_file_size_mb: number;
}

export const analysisApi = {
  uploadFiles: async (
    baselineFile: File,
    renewalFile: File,
    token?: string | null
  ): Promise<{ baseline_s3_key: string; renewal_s3_key: string }> => {
    const baselineInit = await apiRequest<UploadInitResponse>("/uploads/init", {
      method: "POST",
      body: JSON.stringify({
        file_type: "application/pdf",
        filename: baselineFile.name,
      }),
    }, token);

    const baselineFormData = new FormData();
    Object.entries(baselineInit.fields).forEach(([key, value]) => {
      baselineFormData.append(key, value);
    });
    baselineFormData.append("file", baselineFile);

    const baselineS3Response = await fetch(baselineInit.upload_url, {
      method: "POST",
      body: baselineFormData,
    });

    if (!baselineS3Response.ok) {
      throw new ApiError(
        "Failed to upload baseline file to S3",
        baselineS3Response.status
      );
    }

    const renewalInit = await apiRequest<UploadInitResponse>("/uploads/init", {
      method: "POST",
      body: JSON.stringify({
        file_type: "application/pdf",
        filename: renewalFile.name,
      }),
    }, token);

    const renewalFormData = new FormData();
    Object.entries(renewalInit.fields).forEach(([key, value]) => {
      renewalFormData.append(key, value);
    });
    renewalFormData.append("file", renewalFile);

    const renewalS3Response = await fetch(renewalInit.upload_url, {
      method: "POST",
      body: renewalFormData,
    });

    if (!renewalS3Response.ok) {
      throw new ApiError(
        "Failed to upload renewal file to S3",
        renewalS3Response.status
      );
    }

    return {
      baseline_s3_key: baselineInit.s3_key,
      renewal_s3_key: renewalInit.s3_key,
    };
  },

  createAnalysis: async (
    baseline_s3_key: string,
    renewal_s3_key: string,
    metadata?: { company_name?: string; policy_type?: string },
    token?: string | null
  ): Promise<AnalysisJob> => {
    return apiRequest<AnalysisJob>("/analyses", {
      method: "POST",
      body: JSON.stringify({
        baseline_s3_key,
        renewal_s3_key,
        metadata_company_name: metadata?.company_name,
        metadata_policy_type: metadata?.policy_type,
      }),
    }, token);
  },

  getAnalysisStatus: async (jobId: string, token?: string | null): Promise<AnalysisJob> => {
    return apiRequest<AnalysisJob>(`/analyses/${jobId}/status`, {}, token);
  },

  getAnalysisResult: async (jobId: string, token?: string | null): Promise<AnalysisResult> => {
    return apiRequest<AnalysisResult>(`/analyses/${jobId}/result`, {}, token);
  },

  getAnalysisHistory: async (token?: string | null): Promise<AnalysisJob[]> => {
    return apiRequest<AnalysisJob[]>("/analyses", {}, token);
  },

  uploadSingleFile: async (
    file: File,
    token?: string | null
  ): Promise<string> => {
    const init = await apiRequest<UploadInitResponse>("/uploads/init", {
      method: "POST",
      body: JSON.stringify({
        file_type: "application/pdf",
        filename: file.name,
      }),
    }, token);

    const formData = new FormData();
    Object.entries(init.fields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append("file", file);

    const s3Response = await fetch(init.upload_url, {
      method: "POST",
      body: formData,
    });

    if (!s3Response.ok) {
      throw new ApiError("Failed to upload file to S3", s3Response.status);
    }

    return init.s3_key;
  },

  createGapAnalysis: async (
    policyS3Key: string,
    riskProfile: Record<string, unknown>,
    token?: string | null,
    businessLocations?: Array<{ address: string; isPrimary: boolean }>,
  ): Promise<AnalysisJob> => {
    return apiRequest<AnalysisJob>("/analyses/gap", {
      method: "POST",
      body: JSON.stringify({
        policy_s3_key: policyS3Key,
        risk_profile: riskProfile,
        business_locations: businessLocations,
      }),
    }, token);
  },

  getGapAnalysisResult: async (jobId: string, token?: string | null): Promise<GapAnalysisResult> => {
    return apiRequest<GapAnalysisResult>(`/analyses/${jobId}/gap-result`, {}, token);
  },

  updateUserRiskProfile: async (
    body: {
      onboarding_answers: Record<string, unknown>;
      business_locations: Array<{ address: string; isPrimary: boolean }>;
    },
    token?: string | null
  ): Promise<{
    id: string;
    email: string;
    name: string | null;
    company_name: string | null;
    created_at: string;
    updated_at: string;
  }> => {
    return apiRequest("/auth/me/risk-profile", { method: "PATCH", body: JSON.stringify(body) }, token);
  },
};