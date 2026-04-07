from pydantic import BaseModel, EmailStr, Field
from typing import Any, Dict, List, Optional
from datetime import datetime


class UserBase(BaseModel):
    """Base user schema with common fields."""
    email: EmailStr
    name: Optional[str] = None
    company_name: Optional[str] = None


class UserCreate(UserBase):
    """Schema for creating a new user."""
    id: str = Field(..., description="User ID")  # Previously: "Clerk user ID"


class UserUpdate(BaseModel):
    """Schema for updating user information."""
    name: Optional[str] = None
    company_name: Optional[str] = None


class UserResponse(UserBase):
    """Schema for user response."""
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # Pydantic v2 (was orm_mode in v1)


class UserProfile(UserResponse):
    """Extended user profile with additional metadata."""
    total_analyses: int = 0
    completed_analyses: int = 0
    
    class Config:
        from_attributes = True


class BusinessLocationIn(BaseModel):
    address: str
    isPrimary: bool = False


class UserRiskProfileUpdate(BaseModel):
    """Risk / onboarding snapshot saved from the profile editor (Clerk + DB)."""

    onboarding_answers: Dict[str, Any]
    business_locations: List[BusinessLocationIn]

