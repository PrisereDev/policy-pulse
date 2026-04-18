"""
Analyses router for creating and managing policy comparison jobs.
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Path
from fastapi.responses import JSONResponse

from pydantic import ValidationError
from sqlalchemy.orm import Session
from typing import List, Optional, Tuple
import logging
import asyncio
import time

from app.database import get_db
from app.models.user import User
from app.models.analysis_job import AnalysisJob, JobStatus
from app.models.analysis_result import AnalysisResult


from app.schemas.analysis import (
    AnalysisCreateRequest,
    AnalysisJobResponse,
    AnalysisResultResponse,
    AnalysisListItem,
    GapAnalysisCreateRequest,
    GapAnalysisResultResponse,
    CoverageGapItem,
)
from app.services.s3_service import s3_service
from app.services.analysis_processor import analysis_processor
from app.schemas.data import Datum
from app.utils.clerk_auth import get_current_user

import requests


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/analyses", tags=["analyses"])


def _gap_policy_metadata_from_result(
    result: AnalysisResult,
) -> Tuple[Optional[str], Optional[str]]:
    """Read named insured + expiry saved during gap analysis (see analysis_processor)."""
    for e in result.educational_insights or []:
        if isinstance(e, dict) and e.get("change_type") == "gap_policy_metadata":
            raw_bn = e.get("business_name")
            raw_exp = e.get("policy_expiration_date")
            bn = raw_bn.strip() if isinstance(raw_bn, str) and raw_bn.strip() else None
            exp = raw_exp.strip() if isinstance(raw_exp, str) and raw_exp.strip() else None
            return bn, exp
    return None, None
NFHL_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
GEOCODER = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"

LEARN_MORE_URL = "https://agents.floodsmart.gov/articles/flood-maps-and-zones"

# ---------------------------
# Geocode Address
# ---------------------------
def geocode(address):
    params = {
        "SingleLine": address,
        "f": "json",
        "maxLocations": 1
    }

    r = requests.get(GEOCODER, params=params, timeout=5)
    r.raise_for_status()
    data = r.json()

    if not data.get("candidates"):
        raise ValueError("Address not found")

    loc = data["candidates"][0]["location"]
    return loc["y"], loc["x"]  # lat, lon


# ---------------------------
# Query FEMA Flood Hazard Layer
# ---------------------------
def query_fema(lat, lon):
    params = {
        "geometry": f"{lon},{lat}",
        "geometryType": "esriGeometryPoint",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "FLD_ZONE,SFHA_TF,ZONE_SUBTY",
        "returnGeometry": "false",
        "f": "json"
    }

    r = requests.get(NFHL_URL, params=params, timeout=5)
    r.raise_for_status()
    data = r.json()

    features = data.get("features", [])
    if not features:
        return None

    return features[0]["attributes"]


# ---------------------------
# Translate FEMA Zone → User-Friendly Risk
# ---------------------------
def risk_profile(zone):
    if not zone:
        return {
            "risk_level": "Unknown",
            "summary": "Flood risk could not be determined.",
            "insurance_required": False
        }

    zone = zone.upper().strip()

    # High Risk (SFHA)
    if zone.startswith(("A", "V")):
        return {
            "risk_level": "High",
            "summary": (
                "This property is located in a high-risk flood area "
                "with a 1% annual chance of flooding (also known as the 100-year flood zone). "
                "Flood insurance is typically required for federally backed mortgages."
            ),
            "insurance_required": True
        }

    # Moderate / Low Risk
    if zone == "X":
        return {
            "risk_level": "Moderate/Low",
            "summary": (
                "This property is located in a moderate-to-low flood risk area. "
                "Flood insurance is not federally required but is recommended."
            ),
            "insurance_required": False
        }

    # Undetermined
    if zone == "D":
        return {
            "risk_level": "Undetermined",
            "summary": (
                "Flood risk for this property has not been fully determined."
            ),
            "insurance_required": False
        }

    return {
        "risk_level": "Unknown",
        "summary": "Flood zone classification unclear.",
        "insurance_required": False
    }


# ---------------------------
# Main Lookup Function
# ---------------------------
def lookup(address):
    try:
        lat, lon = geocode(address)
        result = query_fema(lat, lon)

        # Outside FEMA coverage
        if result is None:
            return {
                "address": address,
                "coordinates": {
                    "lat": lat,
                    "lon": lon
                },
                "flood_zone": "OUTSIDE_DATA_COVERAGE",
                "sfha": False,
                "risk_level": "Unknown",
                "summary": "This property is outside FEMA flood hazard coverage areas.",
                "insurance_required": False,
                "learn_more_url": LEARN_MORE_URL
            }

        zone = result.get("FLD_ZONE")
        sfha_flag = result.get("SFHA_TF") == "T"

        risk = risk_profile(zone)

        return {
            "address": address,
            "coordinates": {
                "lat": lat,
                "lon": lon
            },
            "flood_zone": zone,
            "sfha": sfha_flag,
            "risk_level": risk["risk_level"],
            "summary": risk["summary"],
            "insurance_required": risk["insurance_required"],
            "learn_more_url": LEARN_MORE_URL
        }

    except Exception as e:
        return {
            "address": address,
            "flood_zone": None,
            "sfha": False,
            "risk_level": "Unknown",
            "summary": "An error occurred while retrieving flood information.",
            "insurance_required": False,
            "error": str(e),
            "learn_more_url": LEARN_MORE_URL
        }


@router.post("", response_model=AnalysisJobResponse, status_code=status.HTTP_201_CREATED)
async def create_analysis(
    request: AnalysisCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Create a new analysis job.
    
    This endpoint:
    1. Creates a job record in the database
    2. Returns the job_id immediately
    3. Starts background processing asynchronously
    
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

        t_analysis_job_db = time.perf_counter()  # TEMP timing
        db.add(job)
        db.commit()
        db.refresh(job)
        logger.info(
            f"[TIMING] create_analysis AnalysisJob add+commit+refresh: {time.perf_counter() - t_analysis_job_db:.3f}s"
        )  # TEMP

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

@router.post("/gap", response_model=AnalysisJobResponse, status_code=status.HTTP_201_CREATED)
async def create_gap_analysis(
    request: GapAnalysisCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Create a gap analysis job for a single policy + risk profile.

    Returns a job_id immediately; the client polls GET /{job_id}/status for progress
    and retrieves results via GET /{job_id}/gap-result when completed.
    """
    try:
        logger.info(f"Creating gap analysis job for user: {user.id}")

        if not s3_service.file_exists(request.policy_s3_key):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Policy file not found in S3: {request.policy_s3_key}",
            )

        policy_filename = request.policy_s3_key.split("/")[-1]

        risk_data = dict(request.risk_profile)
        if request.business_locations:
            risk_data["business_locations"] = [
                loc.model_dump() for loc in request.business_locations
            ]

        job = AnalysisJob(
            user_id=user.id,
            job_type="gap_analysis",
            status=JobStatus.PENDING,
            baseline_s3_key=request.policy_s3_key,
            baseline_filename=policy_filename,
            risk_profile_data=risk_data,
            progress=0,
            status_message="Gap analysis job created, waiting to start...",
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        logger.info(f"Created gap analysis job: {job.id}")

        background_tasks.add_task(analysis_processor.process_gap_analysis_job, job.id)

        return AnalysisJobResponse(
            job_id=job.id,
            status=job.status.value,
            created_at=job.created_at,
            updated_at=job.updated_at,
            baseline_filename=job.baseline_filename,
            renewal_filename=job.renewal_filename or "",
            progress=job.progress,
            message=job.status_message,
            estimated_completion_time=job._estimate_completion_time(),
            error_message=None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create gap analysis job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create gap analysis job",
        )


@router.post("/assessment/")
async def get_data_points(request_json: dict):
    try:
        client_data = Datum(**request_json)
        res = []

        # 1. Location / Premises
        location = client_data.location.strip()
        if not location:
            raise ValueError("Location string cannot be empty")

        res.append(lookup(location))
    
        # 2. Climate / Perishables Coverage
        if client_data.climate:  
            res.append("You have spoilage or outage coverage in place. Review the limit to confirm it matches your maximum perishable inventory exposure.")
        else:  
            res.append("You have perishable exposure but no outage coverage. A 24-hour power loss could eliminate your inventory. Consider adding spoilage coverage.")

        # 3. Events / Professional Liability
        if client_data.events:  
            res.append("You carry professional liability coverage. Review your limits to ensure they align with your highest contract value.")
        else:  
            res.append("You provide professional services without liability coverage. Legal defense and settlements can exceed contract revenue. Consider adding coverage.")

        if client_data.errors_and_omissions:  
            res.append("You have E&O coverage. Periodically review your Limit of Liability to ensure it scales with business growth.")
        else:  
            res.append("You do not have E&O coverage. Professional mistakes can trigger significant legal costs. Strongly consider obtaining a policy.")

        # 5. Payments / Cyber
        if client_data.payments: 
            res.append("You have cyber coverage in place. Review ransomware and third-party data breach sublimits to ensure adequate protection.")
        else:  
            res.append("Processing payments or storing data creates cyber exposure. Consider adding cyber insurance to cover breach recovery and compliance costs.")

        return JSONResponse(status_code=200, content=res)

    except (ValidationError, ValueError) as e:
        logger.error(f"Validation Error: {e}")
        return JSONResponse(status_code=400, content=[None] * 5)

    except Exception as e:
        logger.error(f"Unexpected Error: {e}")
        return JSONResponse(status_code=500, content=[None] * 5)
        
@router.get("/{job_id}/status", response_model=AnalysisJobResponse)
async def get_analysis_status(
    job_id: str = Path(..., description="Analysis job ID"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
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
    user: User = Depends(get_current_user),
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


@router.get("/{job_id}/gap-result", response_model=GapAnalysisResultResponse)
async def get_gap_analysis_result(
    job_id: str = Path(..., description="Analysis job ID"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Get gap analysis results (only available when job is completed).
    """
    try:
        job = db.query(AnalysisJob).filter(
            AnalysisJob.id == job_id,
            AnalysisJob.user_id == user.id,
        ).first()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Analysis job not found: {job_id}",
            )

        if job.status != JobStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Analysis is not completed yet. Current status: {job.status.value}",
            )

        result = db.query(AnalysisResult).filter(
            AnalysisResult.job_id == job_id,
        ).first()

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Gap analysis result not found",
            )

        raw_gaps = result.changes or []
        gaps: list[CoverageGapItem] = []
        for g in raw_gaps:
            if not isinstance(g, dict):
                continue
            gaps.append(
                CoverageGapItem(
                    type=str(g.get("type") or "unknown"),
                    status=str(g.get("status") or "not_covered"),
                    title=str(g.get("title") or ""),
                    explanation=str(g.get("explanation") or ""),
                    affected_locations=g.get("affected_locations")
                    if isinstance(g.get("affected_locations"), list)
                    else None,
                )
            )
        recommendations = [a.get("action", "") for a in (result.suggested_actions or [])]

        business_name, policy_expiration_date = _gap_policy_metadata_from_result(result)

        return GapAnalysisResultResponse(
            job_id=result.job_id,
            status="completed",
            gaps=gaps,
            business_name=business_name,
            policy_expiration_date=policy_expiration_date,
            summary=f"Found {len(gaps)} coverage gap(s) with {len(recommendations)} endorsement recommendation(s).",
            recommendations=recommendations,
            metadata={
                "model_version": result.model_version or "unknown",
                "processing_time_seconds": result.processing_time_seconds,
                "completed_at": result.created_at.isoformat() if result.created_at else None,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get gap analysis result: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get gap analysis result",
        )


@router.get("", response_model=List[AnalysisListItem])
async def list_analyses(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
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

            gap_business_name = None
            if (
                job.job_type == "gap_analysis"
                and job.status == JobStatus.COMPLETED
                and job.result
            ):
                gap_business_name, _ = _gap_policy_metadata_from_result(job.result)

            result.append(AnalysisListItem(
                job_id=job.id,
                status=job.status.value,
                created_at=job.created_at,
                completed_at=job.completed_at,
                baseline_filename=job.baseline_filename,
                renewal_filename=job.renewal_filename,
                total_changes=total_changes,
                company_name=job.metadata_company_name,
                business_name=gap_business_name,
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
    user: User = Depends(get_current_user),
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

