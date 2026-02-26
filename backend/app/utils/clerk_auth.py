"""
Clerk authentication utilities for JWT verification and user management.
"""
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, jwk, JWTError
from jose.utils import base64url_decode
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional, Dict, Any
import requests
import logging
import re
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
        response = requests.get(
            jwks_url,
            timeout=10,
            headers={"Authorization": f"Bearer {settings.clerk_secret_key}"}
        )
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


def _is_valid_email(email: Optional[str]) -> bool:
    """Check if a string looks like a real email (not a template placeholder)."""
    if not email:
        return False
    if "{{" in email or "}}" in email:
        return False
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


def _extract_email_from_token(decoded: Dict[str, Any]) -> Optional[str]:
    """Try multiple strategies to get a real email from JWT claims."""
    email = decoded.get("email")
    if _is_valid_email(email):
        return email

    email_addresses = decoded.get("email_addresses", [])
    if isinstance(email_addresses, list):
        for addr in email_addresses:
            candidate = addr.get("email_address") if isinstance(addr, dict) else addr
            if _is_valid_email(candidate):
                return candidate

    primary = decoded.get("primary_email_address")
    if _is_valid_email(primary):
        return primary

    return None


async def get_current_user(
    user_id: str = Depends(get_current_user_id),
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to get current authenticated user.
    Creates user in database if they don't exist (first login).
    Falls back to Clerk Backend API if the JWT doesn't contain an email.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        return user

    token = credentials.credentials
    decoded = verify_clerk_token(token)

    email = _extract_email_from_token(decoded)
    name = decoded.get("name") or decoded.get("given_name")

    if not email:
        email = _fetch_email_from_clerk_api(user_id)

    if not email:
        email = f"{user_id}@unknown.prisere.app"
        logger.warning(f"Could not resolve email for {user_id}, using placeholder")

    try:
        user = User(
            id=user_id,
            email=email,
            name=name,
            company_name=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        logger.info(f"Created new user: {user_id} ({email})")
        return user

    except IntegrityError:
        db.rollback()
        logger.warning(f"Duplicate email during user creation for {user_id}, retrying lookup")
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account"
        )


def _fetch_email_from_clerk_api(user_id: str) -> Optional[str]:
    """Fetch user email directly from Clerk's Backend API as a fallback."""
    try:
        response = requests.get(
            f"https://api.clerk.com/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        for addr in data.get("email_addresses", []):
            candidate = addr.get("email_address")
            if _is_valid_email(candidate):
                return candidate

        primary_id = data.get("primary_email_address_id")
        if primary_id:
            for addr in data.get("email_addresses", []):
                if addr.get("id") == primary_id:
                    return addr.get("email_address")

        return None
    except Exception as e:
        logger.error(f"Failed to fetch user from Clerk API: {e}")
        return None


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

