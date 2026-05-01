"""
Pydantic schemas for upload endpoints.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any


class UploadInitRequest(BaseModel):
    """Request schema for initializing file upload. Utilizes Pydantic schemas for initializing workflows. """
    file_type: str = Field(
        default="application/pdf",
        description="MIME type of the file to upload"
    )
    filename: str = Field(
        ...,
        description="Original filename",
        min_length=1,
        max_length=255
    )
    
    @field_validator("file_type")
    @classmethod
    def validate_file_type(cls, v: str) -> str:
        """Validate that only PDF files are accepted."""
        allowed_types = ["application/pdf"]
        if v not in allowed_types:
            raise ValueError(f"File type must be one of: {', '.join(allowed_types)}")
        return v
    
    @field_validator("filename")
    @classmethod
    def validate_filename(cls, v: str) -> str:
        """Validate filename has .pdf extension."""
        if not v.lower().endswith('.pdf'):
            raise ValueError("Filename must have .pdf extension")
        return v


class UploadInitResponse(BaseModel):
    """Response schema for upload initialization."""
    upload_url: str = Field(..., description="Presigned POST URL for upload")
    fields: Dict[str, Any] = Field(..., description="Form fields to include in upload")
    s3_key: str = Field(..., description="S3 key where file will be stored")
    expires_at: str = Field(..., description="ISO timestamp when upload URL expires")
    max_file_size_mb: int = Field(..., description="Maximum allowed file size in MB")


class UploadVerifyResponse(BaseModel):
    """Response schema for upload verification."""
    exists: bool = Field(..., description="Whether file exists in S3")
    s3_key: str = Field(..., description="S3 key that was checked")
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="File metadata (size, content_type, etc.) if file exists"
    )

