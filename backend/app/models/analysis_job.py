from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum

from app.database import Base


class JobStatus(str, enum.Enum):
    """Enum for analysis job status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisJob(Base):
    """
    AnalysisJob model for tracking insurance policy comparison jobs.
    """
    __tablename__ = "analysis_jobs"

    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    
    # Foreign key to User
    user_id = Column(String(255), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Job status
    status = Column(
        SQLEnum(JobStatus, native_enum=False, length=20),
        default=JobStatus.PENDING,
        nullable=False,
        index=True
    )
    
    # Progress tracking (0-100)
    progress = Column(Integer, default=0, nullable=False)
    
    # Status message (e.g., "Extracting text from baseline PDF...")
    status_message = Column(String(500), nullable=True)
    
    # S3 keys for uploaded PDFs
    baseline_s3_key = Column(String(500), nullable=False)
    renewal_s3_key = Column(String(500), nullable=False)
    
    # Original filenames
    baseline_filename = Column(String(255), nullable=False)
    renewal_filename = Column(String(255), nullable=False)
    
    # Error message (if status is FAILED)
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.now(timezone.utc), nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc), nullable=False)
    started_at = Column(DateTime, nullable=True)  # When processing started
    completed_at = Column(DateTime, nullable=True)  # When processing completed
    
    # Optional metadata
    metadata_company_name = Column(String(255), nullable=True)
    metadata_policy_type = Column(String(100), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="analysis_jobs")
    result = relationship("AnalysisResult", back_populates="job", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<AnalysisJob(id={self.id}, user_id={self.user_id}, status={self.status})>"

    def to_dict(self):
        """Convert analysis job to dictionary representation (matches frontend API contract)."""
        return {
            "job_id": self.id,
            "status": self.status.value if isinstance(self.status, JobStatus) else self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "baseline_filename": self.baseline_filename,
            "renewal_filename": self.renewal_filename,
            "estimated_completion_time": self._estimate_completion_time(),
            "error_message": self.error_message if self.status == JobStatus.FAILED else None,
            "progress": self.progress,
            "message": self.status_message,
        }

    def _estimate_completion_time(self):
        """
        Estimate completion time based on current progress.
        Returns ISO format timestamp or None.
        """
        if self.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            return self.completed_at.isoformat() if self.completed_at else None
        
        if self.status == JobStatus.PROCESSING and self.started_at:
            # Estimate based on progress (assume 120 seconds total)
            from datetime import timedelta
            elapsed = (datetime.now(timezone.utc) - self.started_at).total_seconds()
            if self.progress > 0:
                estimated_total = (elapsed / self.progress) * 100
                remaining = estimated_total - elapsed
                estimated_completion = datetime.now(timezone.utc) + timedelta(seconds=remaining)
                return estimated_completion.isoformat()
        
        return None

    def update_progress(self, progress: int, message: str = None):
        """Update job progress and optional status message."""
        self.progress = min(max(progress, 0), 100)  # Clamp between 0-100
        if message:
            self.status_message = message
        self.updated_at = datetime.now(timezone.utc)

    def mark_processing(self):
        """Mark job as processing."""
        self.status = JobStatus.PROCESSING
        self.started_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def mark_completed(self):
        """Mark job as completed."""
        self.status = JobStatus.COMPLETED
        self.progress = 100
        self.completed_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def mark_failed(self, error_message: str):
        """Mark job as failed with error message."""
        self.status = JobStatus.FAILED
        self.error_message = error_message
        self.completed_at = datetime.now(timezone.utc) if self.completed_at is None else self.completed_at
        self.updated_at = datetime.now(timezone.utc)

