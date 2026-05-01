"""
Upload router for handling file upload initialization and verification.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Path
import logging

from app.services.s3_service import s3_service
from app.schemas.upload import (
    UploadInitRequest,
    UploadInitResponse,
    UploadVerifyResponse
)
from app.config import settings
from app.utils.clerk_auth import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/uploads", tags=["uploads"])


@router.post("/init", response_model=UploadInitResponse, status_code=status.HTTP_200_OK)
async def initialize_upload(
    request: UploadInitRequest,
    user: User = Depends(get_current_user),
):
    """
    Initialize file upload by generating presigned S3 upload URL.
    
    This endpoint generates a presigned POST URL that allows the client to upload
    a file directly to S3 without going through the backend.
    
    Args:
        request: Upload initialization request with file type and filename
        
    Returns:
        UploadInitResponse: Presigned URL, form fields, and S3 key
        
    Raises:
        400 Bad Request: If file type is not PDF or filename is invalid
        500 Internal Server Error: If S3 URL generation fails
    """
    try:
        s3_key = s3_service.generate_s3_key(
            user_id=user.id,
            filename=request.filename,
            prefix="uploads"
        )
        
        logger.info(f"Initializing upload for file: {request.filename} -> {s3_key}")
        
        # Generate presigned upload URL
        presigned_data = s3_service.generate_presigned_upload_url(
            s3_key=s3_key,
            content_type=request.file_type,
            expiration=3600  # 1 hour
        )
        
        return UploadInitResponse(
            upload_url=presigned_data["url"],
            fields=presigned_data["fields"],
            s3_key=s3_key,
            expires_at=presigned_data["expires_at"],
            max_file_size_mb=settings.max_file_size_mb
        )
        
    except ValueError as e:
        # Validation errors
        logger.error(f"Validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Failed to initialize upload: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize upload. Please try again."
        )


@router.get("/verify/{s3_key:path}", response_model=UploadVerifyResponse)
async def verify_upload(
    s3_key: str = Path(..., description="S3 key to verify")
):
    """
    Verify that a file was successfully uploaded to S3.
    
    After the client uploads a file using the presigned URL, this endpoint
    confirms that the file exists in S3 and returns metadata.
    
    Args:
        s3_key: S3 key of the uploaded file
        
    Returns:
        UploadVerifyResponse: Verification status and file metadata
        
    Raises:
        404 Not Found: If file doesn't exist in S3
        500 Internal Server Error: If verification fails
    """
    try:
        logger.info(f"Verifying upload for S3 key: {s3_key}")
        
        # Check if file exists
        exists = s3_service.file_exists(s3_key)
        
        if not exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found: {s3_key}"
            )
        
        # Get file metadata
        metadata = s3_service.get_file_metadata(s3_key)
        
        # Validate file size
        if metadata and metadata.get("size", 0) > settings.max_file_size_bytes:
            logger.warning(f"File exceeds max size: {s3_key}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size exceeds maximum allowed size of {settings.max_file_size_mb}MB"
            )
        
        logger.info(f"Upload verified successfully: {s3_key}")
        
        return UploadVerifyResponse(
            exists=True,
            s3_key=s3_key,
            metadata=metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to verify upload: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify upload. Please try again."
        )


@router.delete("/{s3_key:path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(
    s3_key: str = Path(..., description="S3 key to delete")
):
    """
    Delete a file from S3.
    
    Args:
        s3_key: S3 key of the file to delete
        
    Returns:
        204 No Content on success
        
    Raises:
        500 Internal Server Error: If deletion fails
    """
    try:
        logger.info(f"Deleting file from S3: {s3_key}")
        
        s3_service.delete_file(s3_key)
        
        logger.info(f"File deleted successfully: {s3_key}")
        return None  # 204 No Content
        
    except Exception as e:
        logger.error(f"Failed to delete file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete file. Please try again."
        )

