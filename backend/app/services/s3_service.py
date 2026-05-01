"""
AWS S3 service for handling file uploads, downloads, and management.
"""
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
from typing import Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import uuid
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class S3Service:
    """Service for interacting with AWS S3."""
    
    def __init__(self):
        """Initialize S3 client with credentials from settings."""
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region,
            config=Config(signature_version='s3v4')
        )
        self.bucket_name = settings.aws_s3_bucket_name
    
    def generate_s3_key(self, user_id: str, filename: str, prefix: str = "uploads") -> str:
        """
        Generate a unique S3 key for file storage.
        
        Args:
            user_id: User ID for organization
            filename: Original filename
            prefix: Key prefix (default: "uploads")
            
        Returns:
            str: S3 key in format: prefix/user_id/uuid-filename
        """
        # Generate unique identifier
        unique_id = str(uuid.uuid4())
        
        # Sanitize filename - keep extension
        file_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        safe_filename = f"{unique_id}.{file_ext}" if file_ext else unique_id
        
        # Construct S3 key
        s3_key = f"{prefix}/{user_id}/{safe_filename}"
        
        return s3_key
    
    def generate_presigned_upload_url(
        self,
        s3_key: str,
        content_type: str = "application/pdf",
        expiration: int = 3600
    ) -> Dict[str, Any]:
        """
        Generate presigned URL for uploading files directly to S3.
        
        Args:
            s3_key: S3 object key
            content_type: MIME type of file (default: application/pdf)
            expiration: URL expiration time in seconds (default: 3600 = 1 hour)
            
        Returns:
            Dict containing:
                - url: Presigned POST URL
                - fields: Form fields to include in upload request
                - key: S3 key
                - expires_at: Expiration timestamp
        """
        try:
            # Generate presigned POST data
            conditions = [
                {"bucket": self.bucket_name},
                {"key": s3_key},
                {"Content-Type": content_type},
                ["content-length-range", 1, settings.max_file_size_bytes]  # 1 byte to max size
            ]
            
            presigned_post = self.s3_client.generate_presigned_post(
                Bucket=self.bucket_name,
                Key=s3_key,
                Fields={
                    "Content-Type": content_type
                },
                Conditions=conditions,
                ExpiresIn=expiration
            )
            
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=expiration)
            
            logger.info(f"Generated presigned upload URL for key: {s3_key}")
            
            return {
                "url": presigned_post["url"],
                "fields": presigned_post["fields"],
                "key": s3_key,
                "expires_at": expires_at.isoformat() + "Z"
            }
            
        except ClientError as e:
            logger.error(f"Error generating presigned upload URL: {e}")
            raise Exception(f"Failed to generate upload URL: {str(e)}")
    
    def generate_presigned_download_url(
        self,
        s3_key: str,
        expiration: int = 3600,
        response_content_type: Optional[str] = None
    ) -> str:
        """
        Generate presigned URL for downloading files from S3.
        
        Args:
            s3_key: S3 object key
            expiration: URL expiration time in seconds (default: 3600 = 1 hour)
            response_content_type: Override Content-Type header in response
            
        Returns:
            str: Presigned GET URL
        """
        try:
            params = {
                'Bucket': self.bucket_name,
                'Key': s3_key
            }
            
            if response_content_type:
                params['ResponseContentType'] = response_content_type
            
            url = self.s3_client.generate_presigned_url(
                ClientMethod='get_object',
                Params=params,
                ExpiresIn=expiration
            )
            
            logger.info(f"Generated presigned download URL for key: {s3_key}")
            return url
            
        except ClientError as e:
            logger.error(f"Error generating presigned download URL: {e}")
            raise Exception(f"Failed to generate download URL: {str(e)}")
    
    def download_file_content(self, s3_key: str) -> bytes:
        """
        Download file content from S3 as bytes.
        
        Args:
            s3_key: S3 object key
            
        Returns:
            bytes: File content
            
        Raises:
            Exception: If file doesn't exist or download fails
        """
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            content = response['Body'].read()
            logger.info(f"Downloaded file from S3: {s3_key} ({len(content)} bytes)")
            return content
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logger.error(f"File not found in S3: {s3_key}")
                raise Exception(f"File not found: {s3_key}")
            else:
                logger.error(f"Error downloading file from S3: {e}")
                raise Exception(f"Failed to download file: {str(e)}")
    
    def delete_file(self, s3_key: str) -> bool:
        """
        Delete file from S3.
        
        Args:
            s3_key: S3 object key
            
        Returns:
            bool: True if deleted successfully
        """
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            logger.info(f"Deleted file from S3: {s3_key}")
            return True
            
        except ClientError as e:
            logger.error(f"Error deleting file from S3: {e}")
            raise Exception(f"Failed to delete file: {str(e)}")
    
    def delete_files(self, s3_keys: list[str]) -> Dict[str, Any]:
        """
        Delete multiple files from S3 in batch.
        
        Args:
            s3_keys: List of S3 object keys
            
        Returns:
            Dict with deleted and error counts
        """
        if not s3_keys:
            return {"deleted": 0, "errors": 0}
        
        try:
            # Prepare objects for deletion
            objects = [{"Key": key} for key in s3_keys]
            
            response = self.s3_client.delete_objects(
                Bucket=self.bucket_name,
                Delete={"Objects": objects}
            )
            
            deleted = len(response.get("Deleted", []))
            errors = len(response.get("Errors", []))
            
            logger.info(f"Batch deleted {deleted} files from S3, {errors} errors")
            
            return {
                "deleted": deleted,
                "errors": errors,
                "error_details": response.get("Errors", [])
            }
            
        except ClientError as e:
            logger.error(f"Error batch deleting files from S3: {e}")
            raise Exception(f"Failed to delete files: {str(e)}")
    
    def file_exists(self, s3_key: str) -> bool:
        """
        Check if file exists in S3.
        
        Args:
            s3_key: S3 object key
            
        Returns:
            bool: True if file exists, False otherwise
        """
        try:
            self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            return True
            
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            else:
                logger.error(f"Error checking file existence in S3: {e}")
                raise Exception(f"Failed to check file existence: {str(e)}")
    
    def get_file_metadata(self, s3_key: str) -> Optional[Dict[str, Any]]:
        """
        Get file metadata from S3.
        
        Args:
            s3_key: S3 object key
            
        Returns:
            Dict with file metadata (size, content_type, last_modified) or None if not found
        """
        try:
            response = self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            return {
                "size": response.get("ContentLength"),
                "content_type": response.get("ContentType"),
                "last_modified": response.get("LastModified"),
                "etag": response.get("ETag", "").strip('"')
            }
            
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return None
            else:
                logger.error(f"Error getting file metadata from S3: {e}")
                raise Exception(f"Failed to get file metadata: {str(e)}")


# Global S3 service instance
s3_service = S3Service()

