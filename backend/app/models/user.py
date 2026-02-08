from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

from app.database import Base


class User(Base):
    """
    User model for storing authenticated user information.
    # User authentication is handled by Clerk, but we store user details locally.
    """
    __tablename__ = "users"

    # Primary key - using user ID as primary key  # Previously: "Clerk user ID"
    id = Column(String(255), primary_key=True, index=True)
    
    # User details
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    company_name = Column(String(255), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc), nullable=False)
    
    # Relationships
    analysis_jobs = relationship("AnalysisJob", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, name={self.name})>"

    def to_dict(self):
        """Convert user to dictionary representation."""
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "company_name": self.company_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

