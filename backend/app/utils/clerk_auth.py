"""
Clerk authentication utilities for JWT verification and user management.
"""
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, jwk, JWTError
from jose.utils import base64url_decode
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
import requests
import logging
from datetime import datetime

from app.config import settings
from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

# Security scheme for Bearer token
security = HTTPBearer()

# Cache for JWKS (JSON Web Key Set)
_jwks_cache: Optional[Dict[str, Any]] = None


def get_clerk_jwks() -> Dict[str, Any]:
    """
    Fetch Clerk's JWKS (JSON Web Key Set) for JWT verification.
    Caches the result to avoid repeated requests.
    
    Returns:
        Dict containing JWKS keys
    """
    global _jwks_cache
    
    if _jwks_cache is not None:
        return _jwks_cache
    
    # Clerk JWKS endpoint
    jwks_url = f"https://api.clerk.com/v1/jwks"
    
    try:
        response = requests.get(jwks_url, timeout=10)
        response.raise_for_status()
        _jwks_cache = response.json()
        logger.info("Successfully fetched Clerk JWKS")
        return _jwks_cache
    except requests.RequestException as e:
        logger.error(f"Failed to fetch Clerk JWKS: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify authentication. Please try again later."
        )


def verify_clerk_token(token: str) -> Dict[str, Any]:
    """
    Verify Clerk JWT token and return decoded claims.
    
    Args:
        token: JWT token string
        
    Returns:
        Dict containing decoded JWT claims (user_id, email, etc.)
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        # Decode header to get key ID (kid)
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        
        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: Missing key ID"
            )
        
        # Get JWKS and find matching key
        jwks = get_clerk_jwks()
        key = None
        
        for jwk_key in jwks.get("keys", []):
            if jwk_key.get("kid") == kid:
                key = jwk_key
                break
        
        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: Key not found"
            )
        
        # Verify and decode token
        # Note: Clerk tokens typically use RS256 algorithm
        decoded_token = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": False,  # Clerk doesn't use aud claim by default
            }
        )
        
        logger.info(f"Successfully verified token for user: {decoded_token.get('sub')}")
        return decoded_token
        
    except JWTError as e:
        logger.error(f"JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> str:
    """
    Dependency to get current user ID from JWT token.
    
    Args:
        credentials: HTTP Bearer credentials with JWT token
        
    Returns:
        str: Clerk user ID
        
    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials
    decoded = verify_clerk_token(token)
    
    # Clerk stores user ID in 'sub' claim
    user_id = decoded.get("sub")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: Missing user ID"
        )
    
    return user_id


async def get_current_user(
    user_id: str = Depends(get_current_user_id),
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to get current authenticated user.
    Creates user in database if they don't exist (first login).
    
    Args:
        user_id: Clerk user ID from token
        credentials: HTTP Bearer credentials (for additional claims)
        db: Database session
        
    Returns:
        User: Current authenticated user
        
    Raises:
        HTTPException: If user cannot be created or retrieved
    """
    # Check if user exists in database
    user = db.query(User).filter(User.id == user_id).first()
    
    if user:
        return user
    
    # User doesn't exist - create from token claims
    token = credentials.credentials
    decoded = verify_clerk_token(token)
    
    # Extract user info from token
    email = decoded.get("email")
    name = decoded.get("name") or decoded.get("given_name")
    
    if not email:
        # Try to get email from email_addresses claim (Clerk format)
        email_addresses = decoded.get("email_addresses", [])
        if email_addresses and len(email_addresses) > 0:
            email = email_addresses[0].get("email_address")
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create user: Email not found in token"
        )
    
    try:
        # Create new user
        user = User(
            id=user_id,
            email=email,
            name=name,
            company_name=None  # Can be updated later
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        logger.info(f"Created new user: {user_id} ({email})")
        return user
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account"
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Dependency to get current user if authenticated, None otherwise.
    Useful for endpoints that work with or without authentication.
    
    Args:
        credentials: Optional HTTP Bearer credentials
        db: Database session
        
    Returns:
        Optional[User]: Current user if authenticated, None otherwise
    """
    if not credentials:
        return None
    
    try:
        user_id = await get_current_user_id(credentials)
        return await get_current_user(user_id, credentials, db)
    except HTTPException:
        return None


def require_auth(user: User = Depends(get_current_user)) -> User:
    """
    Dependency to require authentication.
    Raises 401 if user is not authenticated.
    
    Args:
        user: Current user from get_current_user
        
    Returns:
        User: Authenticated user
    """
    return user

