import { AnalysisJob, AnalysisResult } from "@/types/api";

// API routes are now part of the Next.js app
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://prisere-backend.onrender.com/v1';

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
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorData.code
      );
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
};