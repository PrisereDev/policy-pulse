from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Server Configuration
    port: int = 3001
    environment: str = "development"
    allowed_origins: str = "http://localhost:3000,http://localhost:3001"
    log_level: str = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    
    # Database
    database_url: str
    
    # AWS S3
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_s3_bucket_name: str
    aws_region: str = "us-east-1"
    
    # Clerk Authentication
    clerk_secret_key: str
    clerk_publishable_key: str
    
    # Anthropic Claude API
    anthropic_api_key: str
    # Available models (depending on your billing plan):
    # - claude-3-haiku-20240307 (fast, cost-effective)
    # - claude-3-sonnet-20240229 (balanced)
    # - claude-3-5-sonnet-20241022 (most capable, requires upgraded plan)
    anthropic_model: str = "claude-3-haiku-20240307"
    
    # File Upload Settings
    max_file_size_mb: int = 25
    allowed_file_types: str = "application/pdf"
    
    # Processing Settings
    job_timeout_seconds: int = 120
    pdf_retention_hours: int = 24
    results_retention_days: int = 365
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    @property
    def cors_origins(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]
    
    @property
    def max_file_size_bytes(self) -> int:
        """Convert max file size from MB to bytes."""
        return self.max_file_size_mb * 1024 * 1024


# Global settings instance
settings = Settings()

