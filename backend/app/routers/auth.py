"""
Authentication router for user management endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
import logging

from app.database import get_db
from app.models.user import User
from app.models.analysis_job import AnalysisJob, JobStatus
from app.schemas.user import UserResponse, UserUpdate, UserProfile
from app.utils.clerk_auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/auth", tags=["authentication"])


@router.get("/verify", status_code=status.HTTP_200_OK)
async def verify_token(user: User = Depends(get_current_user)):
    """
    Verify authentication token is valid.
    
    Returns:
        Dict with verification status and user ID
    """
    return {
        "authenticated": True,
        "user_id": user.id,
        "email": user.email,
        "message": "Token is valid"
    }


@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current authenticated user's profile with analysis statistics.
    
    Returns:
        UserProfile: User information with analysis counts
    """
    # Get analysis statistics
    total_analyses = db.query(func.count(AnalysisJob.id)).filter(
        AnalysisJob.user_id == user.id
    ).scalar() or 0
    
    completed_analyses = db.query(func.count(AnalysisJob.id)).filter(
        AnalysisJob.user_id == user.id,
        AnalysisJob.status == JobStatus.COMPLETED
    ).scalar() or 0
    
    return UserProfile(
        id=user.id,
        email=user.email,
        name=user.name,
        company_name=user.company_name,
        created_at=user.created_at,
        updated_at=user.updated_at,
        total_analyses=total_analyses,
        completed_analyses=completed_analyses
    )


@router.patch("/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current authenticated user's profile information.
    
    Args:
        user_update: Fields to update (name, company_name)
        
    Returns:
        UserResponse: Updated user information
    """
    try:
        # Update only provided fields
        update_data = user_update.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(user, field, value)
        
        db.commit()
        db.refresh(user)
        
        logger.info(f"Updated user profile: {user.id}")
        
        return UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            company_name=user.company_name,
            created_at=user.created_at,
            updated_at=user.updated_at
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update user profile: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_user(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete current authenticated user's account.
    WARNING: This will delete all associated analysis jobs and results.
    
    Returns:
        204 No Content on success
    """
    try:
        # Delete user (cascade will handle analysis_jobs and analysis_results)
        db.delete(user)
        db.commit()
        
        logger.info(f"Deleted user account: {user.id}")
        
        return None  # 204 No Content
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete user account: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account"
        )

