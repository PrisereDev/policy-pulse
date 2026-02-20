"""
Analyses router for creating and managing policy comparison jobs.
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Path
from fastapi.responses import JSONResponse

from pydantic import ValidationError
from sqlalchemy.orm import Session
from typing import List
import logging
import asyncio

from app.database import get_db
from app.models.user import User
from app.models.analysis_job import AnalysisJob, JobStatus
from app.models.analysis_result import AnalysisResult


from app.schemas.analysis import (
    AnalysisCreateRequest,
    AnalysisJobResponse,
    AnalysisResultResponse,
    AnalysisListItem,
)
from app.services.s3_service import s3_service
from app.services.analysis_processor import analysis_processor
from app.schemas.data import Datum
# from app.utils.clerk_auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/analyses", tags=["analyses"])


# TODO: Re-enable authentication when Clerk keys are available
# For now, using mock user for testing
def get_mock_user():
    """Mock user for testing without Clerk authentication."""
    from app.models.user import User
    user = User()
    user.id = "test_user_123"
    user.email = "test@example.com"
    user.name = "Test User"
    return user


@router.post("", response_model=AnalysisJobResponse, status_code=status.HTTP_201_CREATED)
async def create_analysis(
    request: AnalysisCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    # user: User = Depends(get_current_user)  # TODO: Enable when Clerk keys available
    user: User = Depends(get_mock_user)  # Temporary for testing
):
    """
    Create a new analysis job.
    
    This endpoint:
    1. Validates that both PDFs exist in S3
    2. Creates a job record in the database
    3. Returns the job_id immediately
    4. Starts background processing asynchronously
    
    The client should poll GET /analyses/{job_id}/status to check progress.
    
    Args:
        request: Analysis creation request with S3 keys
        background_tasks: FastAPI background tasks
        db: Database session
        user: Current authenticated user
        
    Returns:
        AnalysisJobResponse: Created job with job_id and initial status
    """
    try:
        logger.info(f"Creating analysis job for user: {user.id}")
        logger.info(f"Baseline S3 key: {request.baseline_s3_key}")
        logger.info(f"Renewal S3 key: {request.renewal_s3_key}")
        
        # Validate that both files exist in S3
        if not s3_service.file_exists(request.baseline_s3_key):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Baseline file not found in S3: {request.baseline_s3_key}"
            )
        
        if not s3_service.file_exists(request.renewal_s3_key):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Renewal file not found in S3: {request.renewal_s3_key}"
            )
        
        logger.info("Both PDF files verified in S3")
        
        # Extract filenames from S3 keys
        baseline_filename = request.baseline_s3_key.split('/')[-1]
        renewal_filename = request.renewal_s3_key.split('/')[-1]
        
        # Create analysis job
        job = AnalysisJob(
            user_id=user.id,
            status=JobStatus.PENDING,
            baseline_s3_key=request.baseline_s3_key,
            renewal_s3_key=request.renewal_s3_key,
            baseline_filename=baseline_filename,
            renewal_filename=renewal_filename,
            metadata_company_name=request.metadata_company_name,
            metadata_policy_type=request.metadata_policy_type,
            progress=0,
            status_message="Job created, waiting to start..."
        )
        
        db.add(job)
        db.commit()
        db.refresh(job)
        
        logger.info(f"Created analysis job: {job.id}")
        
        # Start background processing
        background_tasks.add_task(analysis_processor.process_analysis_job, job.id)
        
        logger.info(f"Background task started for job: {job.id}")
        
        # Return job response
        return AnalysisJobResponse(
            job_id=job.id,
            status=job.status.value,
            created_at=job.created_at,
            updated_at=job.updated_at,
            baseline_filename=job.baseline_filename,
            renewal_filename=job.renewal_filename,
            progress=job.progress,
            message=job.status_message,
            estimated_completion_time=job._estimate_completion_time(),
            error_message=None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create analysis job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create analysis job"
        )

@router.post("/assessment/")
async def get_data_points(request_json: dict):
    try:
        client_data = Datum(**request_json)
        res = []
        if client_data.location.strip():
            res.append(f"Analysis for {client_data.location}: Since you have a physical presence, review your property and premise liability limits.")
            #SYDANE's ANALYSIS CALLED HERE TO RETURN INFO
        else:
            raise ValueError("Location string cannot be empty")

        # 2. Climate
        if client_data.climate:
            res.append("We advise you to review your policy against potential damages from adverse weather conditions.")
        else:
            res.append("Risk: Without climate-specific coverage, inventory loss due to temperature fluctuations will not be reimbursed. Please review your policy.")

        # 3. Events
        if client_data.events:
            res.append("Review your professional advice coverage to ensure your current limits match your highest contract value.")
        else:
            res.append("Risk: You are currently exposed to lawsuits arising from professional errors or technical service failures. Please review your policy.")

        # 4. Errors & Omissions
        if client_data.errors_and_omissions:
            res.append("We suggest a periodic review of your E&O 'Limit of Liability' to ensure it keeps pace with your business growth.")
        else:
            res.append("Risk: Legal fees and settlements for professional mistakes often exceed contract values; E&O is highly recommended. Please review your policy.")

        # 5. Payments
        if client_data.payments:
            res.append("Review your Cyber Insurance policy specifically for Ransomware and Third-Party Data Breach recovery.")
        else:
            res.append("Risk: Handling customer data without Cyber Insurance leaves you liable for notification costs and legal penalties after a hack. Please review your policy.")

        return JSONResponse(status_code=200, content=res)

    except (ValidationError, ValueError, Exception) as e:
        logger.error(f"Validation or Logic Error: {e}")
        return JSONResponse(
            status_code=500,
            content=[None, None, None, None, None]
        )
    
@router.get("/{job_id}/status", response_model=AnalysisJobResponse)
async def get_analysis_status(
    job_id: str = Path(..., description="Analysis job ID"),
    db: Session = Depends(get_db),
    # user: User = Depends(get_current_user)  # TODO: Enable when Clerk keys available
    user: User = Depends(get_mock_user)  # Temporary for testing
):
    """
    Get current status and progress of an analysis job.
    
    This endpoint is used for polling during processing.
    
    Args:
        job_id: The analysis job ID
        db: Database session
        user: Current authenticated user
        
    Returns:
        AnalysisJobResponse: Current job status and progress
    """
    try:
        # Get job from database
        job = db.query(AnalysisJob).filter(
            AnalysisJob.id == job_id,
            AnalysisJob.user_id == user.id
        ).first()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Analysis job not found: {job_id}"
            )
        
        # Return status
        return AnalysisJobResponse(
            job_id=job.id,
            status=job.status.value,
            created_at=job.created_at,
            updated_at=job.updated_at,
            baseline_filename=job.baseline_filename,
            renewal_filename=job.renewal_filename,
            progress=job.progress,
            message=job.status_message,
            estimated_completion_time=job._estimate_completion_time(),
            error_message=job.error_message if job.status == JobStatus.FAILED else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get job status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get job status"
        )


@router.get("/{job_id}/result", response_model=AnalysisResultResponse)
async def get_analysis_result(
    job_id: str = Path(..., description="Analysis job ID"),
    db: Session = Depends(get_db),
    # user: User = Depends(get_current_user)  # TODO: Enable when Clerk keys available
    user: User = Depends(get_mock_user)  # Temporary for testing
):
    """
    Get full analysis results (only available when job is completed).
    
    Args:
        job_id: The analysis job ID
        db: Database session
        user: Current authenticated user
        
    Returns:
        AnalysisResultResponse: Complete analysis results
    """
    try:
        # Get job from database
        job = db.query(AnalysisJob).filter(
            AnalysisJob.id == job_id,
            AnalysisJob.user_id == user.id
        ).first()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Analysis job not found: {job_id}"
            )
        
        # Check if job is completed
        if job.status != JobStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Analysis is not completed yet. Current status: {job.status.value}"
            )
        
        # Get result from database
        result = db.query(AnalysisResult).filter(
            AnalysisResult.job_id == job_id
        ).first()
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Analysis result not found"
            )
        
        # Serialize result to dict with error handling
        try:
            result_dict = result.to_dict()
            logger.info(f"Successfully serialized result for job: {job_id}")
            return result_dict
        except Exception as serialization_error:
            logger.error(f"Failed to serialize result for job {job_id}: {serialization_error}")
            logger.error(f"Result object: total_changes={result.total_changes}, model={result.model_version}")
            import traceback
            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to serialize analysis result"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get analysis result: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get analysis result"
        )


@router.get("", response_model=List[AnalysisListItem])
async def list_analyses(
    db: Session = Depends(get_db),
    # user: User = Depends(get_current_user)  # TODO: Enable when Clerk keys available
    user: User = Depends(get_mock_user)  # Temporary for testing
):
    """
    List all analysis jobs for the current user.
    
    Returns jobs ordered by creation date (newest first).
    
    Args:
        db: Database session
        user: Current authenticated user
        
    Returns:
        List[AnalysisListItem]: List of user's analysis jobs
    """
    try:
        # Get all jobs for user
        jobs = db.query(AnalysisJob).filter(
            AnalysisJob.user_id == user.id
        ).order_by(AnalysisJob.created_at.desc()).all()
        
        # Build response
        result = []
        for job in jobs:
            # Get total changes count if job is completed
            total_changes = None
            if job.status == JobStatus.COMPLETED and job.result:
                total_changes = job.result.total_changes
            
            result.append(AnalysisListItem(
                job_id=job.id,
                status=job.status.value,
                created_at=job.created_at,
                completed_at=job.completed_at,
                baseline_filename=job.baseline_filename,
                renewal_filename=job.renewal_filename,
                total_changes=total_changes,
                company_name=job.metadata_company_name
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"Failed to list analyses: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list analyses"
        )


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_analysis(
    job_id: str = Path(..., description="Analysis job ID"),
    db: Session = Depends(get_db),
    # user: User = Depends(get_current_user)  # TODO: Enable when Clerk keys available
    user: User = Depends(get_mock_user)  # Temporary for testing
):
    """
    Delete an analysis job and its results.
    
    This will delete:
    - The job record
    - Associated results (cascade)
    - Note: PDFs are already deleted after processing
    
    Args:
        job_id: The analysis job ID
        db: Database session
        user: Current authenticated user
        
    Returns:
        204 No Content on success
    """
    try:
        # Get job from database
        job = db.query(AnalysisJob).filter(
            AnalysisJob.id == job_id,
            AnalysisJob.user_id == user.id
        ).first()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Analysis job not found: {job_id}"
            )
        
        # Delete job (cascade will delete result)
        db.delete(job)
        db.commit()
        
        logger.info(f"Deleted analysis job: {job_id}")
        
        return None  # 204 No Content
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete analysis: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete analysis"
        )

