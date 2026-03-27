"""
Pydantic schemas for analysis endpoints.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class AnalysisCreateRequest(BaseModel):
    """Request schema for creating an analysis job."""
    baseline_s3_key: str = Field(..., description="S3 key for baseline/current policy PDF")
    renewal_s3_key: str = Field(..., description="S3 key for renewal policy PDF")
    metadata_company_name: Optional[str] = Field(None, description="Company name (optional)")
    metadata_policy_type: Optional[str] = Field(None, description="Policy type (optional)")


class AnalysisJobResponse(BaseModel):
    """Response schema for analysis job (status)."""
    job_id: str
    status: str  # pending, processing, completed, failed
    created_at: datetime
    updated_at: datetime
    baseline_filename: str
    renewal_filename: Optional[str] = None
    progress: Optional[int] = None
    message: Optional[str] = None
    estimated_completion_time: Optional[str] = None
    error_message: Optional[str] = None
    
    class Config:
        from_attributes = True


class CoverageChange(BaseModel):
    """Schema for a single coverage change."""
    id: Optional[str] = None
    category: str
    change_type: str
    title: str
    description: str
    baseline_value: str
    renewal_value: str
    change_amount: Optional[str] = None
    percentage_change: Optional[float] = None
    confidence: Optional[float] = None
    page_references: Optional[Dict[str, List[int]]] = None


class PremiumComparison(BaseModel):
    """Schema for premium comparison."""
    baseline_premium: Optional[float] = None
    renewal_premium: Optional[float] = None
    difference: Optional[float] = None
    percentage_change: Optional[float] = None


class AnalysisSummary(BaseModel):
    """Schema for analysis summary."""
    total_changes: int
    change_categories: Dict[str, int]


class AnalysisResultResponse(BaseModel):
    """Response schema for completed analysis results."""
    job_id: str
    status: str
    summary: AnalysisSummary
    changes: List[CoverageChange]
    premium_comparison: PremiumComparison
    suggested_actions: List[Dict[str, str]]
    educational_insights: List[Dict[str, str]]
    metadata: Dict[str, Any]
    
    class Config:
        from_attributes = True


class AnalysisListItem(BaseModel):
    """Schema for analysis list item."""
    job_id: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    baseline_filename: str
    renewal_filename: Optional[str] = None
    total_changes: Optional[int] = None
    company_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class GapAnalysisCreateRequest(BaseModel):
    """Request schema for creating a gap analysis job."""
    policy_s3_key: str = Field(..., description="S3 key for the uploaded policy PDF")
    risk_profile: Dict[str, Any] = Field(..., description="Risk profile data from onboarding")


class CoverageGapItem(BaseModel):
    """Schema for a single coverage gap."""
    type: str
    status: str  # "covered" or "not_covered"
    title: str
    explanation: str


class GapAnalysisResultResponse(BaseModel):
    """Response schema for gap analysis results."""
    job_id: str
    status: str
    gaps: List[CoverageGapItem]
    business_name: Optional[str] = None
    policy_expiration_date: Optional[str] = None
    summary: str
    recommendations: List[str]
    metadata: Dict[str, Any]

    class Config:
        from_attributes = True

