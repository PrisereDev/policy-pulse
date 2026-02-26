from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from pydantic import ValidationError
import logging
import time

from app.config import settings
from app.utils.logging_config import setup_logging
from app.middleware.exception_handler import (
    http_exception_handler,
    validation_exception_handler,
    pydantic_validation_exception_handler,
    general_exception_handler,
)

# Configure structured logging
setup_logging(log_level=settings.log_level if hasattr(settings, 'log_level') else "INFO")
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Prisere Insurance Policy Comparison API",
    description="Backend API for comparing insurance policy renewals",
    version="1.0.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register exception handlers
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(ValidationError, pydantic_validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Log all HTTP requests with timing information.
    
    Args:
        request: The incoming request
        call_next: The next middleware/route handler
        
    Returns:
        Response from the route handler
    """
    start_time = time.time()
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    duration_ms = (time.time() - start_time) * 1000
    
    # Log request details
    logger.info(
        f"{request.method} {request.url.path} {response.status_code} ({duration_ms:.2f}ms)",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2),
            "client": request.client.host if request.client else None,
        }
    )
    
    return response


# Health check endpoint
@app.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint to verify service is running."""
    from app.utils.legal import get_legal_disclaimer
    
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": "prisere-api",
            "version": "1.0.0",
            "environment": settings.environment,
            "disclaimer": get_legal_disclaimer()
        }
    )


@app.get("/", tags=["root"])
async def root():
    """Root endpoint."""
    from app.utils.legal import get_legal_disclaimer
    
    return {
        "message": "Prisere Insurance Policy Comparison API",
        "version": "1.0.0",
        "docs": "/docs" if settings.environment == "development" else "disabled",
        "disclaimer": get_legal_disclaimer()
    }


# Import and include routers
# Auth router disabled for testing without Clerk keys
# from app.routers import auth
# app.include_router(auth.router)

# Upload router (no auth required for testing)
from app.routers import uploads, analyses
app.include_router(uploads.router)
app.include_router(analyses.router)


@app.on_event("startup")
async def startup_event():
    """Log startup information."""
    logger.info("=" * 60)
    logger.info("Prisere API Starting...")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Port: {settings.port}")
    logger.info("Registered routes:")
    for route in app.routes:
        if hasattr(route, "path") and hasattr(route, "methods"):
            logger.info(f"  {list(route.methods)[0] if route.methods else 'GET'} {route.path}")
    logger.info("=" * 60)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.environment == "development"
    )

