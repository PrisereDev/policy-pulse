"""
Background analysis processor for comparing insurance policies.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any
import traceback

from sqlalchemy.orm import Session

from app.database import get_db_context
from app.models.analysis_job import AnalysisJob, JobStatus
from app.models.analysis_result import AnalysisResult
from app.services.s3_service import s3_service
from app.services.pdf_service import pdf_service
from app.services.claude_service import claude_service

logger = logging.getLogger(__name__)


class AnalysisProcessor:
    """Process analysis jobs in the background."""
    
    async def process_analysis_job(self, job_id: str) -> None:
        """
        Process a single analysis job asynchronously.
        
        This function:
        1. Downloads both PDFs from S3
        2. Extracts text from both PDFs
        3. Calls Claude API for comparison
        4. Saves results to database
        5. Deletes PDFs from S3 (even if processing fails)
        6. Updates job status throughout
        
        Args:
            job_id: The analysis job ID to process
        """
        start_time = datetime.now(timezone.utc)
        baseline_s3_key = None
        renewal_s3_key = None
        
        try:
            # Get job from database
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                
                if not job:
                    logger.error(f"Job not found: {job_id}")
                    return
                
                baseline_s3_key = job.baseline_s3_key
                renewal_s3_key = job.renewal_s3_key
                
                # Mark job as processing
                job.mark_processing()
                job.update_progress(5, "Starting analysis...")
                db.commit()
                
                logger.info(f"Starting analysis job: {job_id}")
                logger.info(f"Baseline: {baseline_s3_key}")
                logger.info(f"Renewal: {renewal_s3_key}")
            
            # Step 1: Download baseline PDF from S3
            logger.info(f"[{job_id}] Downloading baseline PDF from S3...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(10, "Downloading baseline policy from S3...")
                db.commit()
            
            baseline_bytes = s3_service.download_file_content(baseline_s3_key)
            logger.info(f"[{job_id}] Downloaded baseline PDF: {len(baseline_bytes)} bytes")
            
            # Step 2: Download renewal PDF from S3
            logger.info(f"[{job_id}] Downloading renewal PDF from S3...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(20, "Downloading renewal policy from S3...")
                db.commit()
            
            renewal_bytes = s3_service.download_file_content(renewal_s3_key)
            logger.info(f"[{job_id}] Downloaded renewal PDF: {len(renewal_bytes)} bytes")
            
            # Step 3: Extract text from baseline PDF
            logger.info(f"[{job_id}] Extracting text from baseline PDF...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(30, "Extracting text from baseline policy...")
                db.commit()
            
            baseline_result = pdf_service.extract_text_with_metadata(baseline_bytes)
            baseline_text = baseline_result['text']
            baseline_metadata = baseline_result['metadata']
            
            logger.info(f"[{job_id}] Extracted baseline text: {len(baseline_text)} characters, {baseline_metadata['page_count']} pages")
            
            # Step 4: Extract text from renewal PDF
            logger.info(f"[{job_id}] Extracting text from renewal PDF...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(40, "Extracting text from renewal policy...")
                db.commit()
            
            renewal_result = pdf_service.extract_text_with_metadata(renewal_bytes)
            renewal_text = renewal_result['text']
            renewal_metadata = renewal_result['metadata']
            
            logger.info(f"[{job_id}] Extracted renewal text: {len(renewal_text)} characters, {renewal_metadata['page_count']} pages")
            
            # Step 5: Compare policies using Claude API
            logger.info(f"[{job_id}] Comparing policies with Claude AI...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(50, "Analyzing policy differences with AI...")
                db.commit()
            
            comparison_result = claude_service.compare_policies(
                baseline_text=baseline_text,
                renewal_text=renewal_text,
                baseline_metadata=baseline_metadata,
                renewal_metadata=renewal_metadata
            )
            
            logger.info(f"[{job_id}] Claude comparison completed")
            logger.info(f"[{job_id}] Found {len(comparison_result.get('coverage_changes', []))} coverage changes")
            
            # Step 6: Save results to database
            logger.info(f"[{job_id}] Saving results to database...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(90, "Saving analysis results...")
                db.commit()
            
            # Calculate processing time
            processing_time = int((datetime.now(timezone.utc) - start_time).total_seconds())
            
            
            # Create analysis result
            with get_db_context() as db:
                analysis_result = AnalysisResult.from_claude_response(
                    job_id=job_id,
                    claude_data=comparison_result,
                    model_version=claude_service.model,
                    processing_time=processing_time
                )
                
                db.add(analysis_result)
                db.commit()
                
                logger.info(f"[{job_id}] Results saved to database")
            
            # Step 7: Mark job as completed
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.mark_completed()
                db.commit()
                
                logger.info(f"[{job_id}] Job marked as completed")
            
            logger.info(f"[{job_id}] Analysis completed successfully in {processing_time} seconds")
            
        except Exception as e:
            logger.error(f"[{job_id}] Analysis failed: {e}")
            logger.error(traceback.format_exc())
            
            # Mark job as failed
            try:
                with get_db_context() as db:
                    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                    if job:
                        error_message = f"Analysis failed: {str(e)}"
                        job.mark_failed(error_message)
                        db.commit()
                        logger.info(f"[{job_id}] Job marked as failed")
            except Exception as db_error:
                logger.error(f"[{job_id}] Failed to mark job as failed: {db_error}")
        
        finally:
            # Step 8: Clean up - Delete PDFs from S3 (always execute, even if processing failed)
            logger.info(f"[{job_id}] Cleaning up S3 files...")
            
            try:
                if baseline_s3_key:
                    s3_service.delete_file(baseline_s3_key)
                    logger.info(f"[{job_id}] Deleted baseline PDF from S3: {baseline_s3_key}")
            except Exception as e:
                logger.error(f"[{job_id}] Failed to delete baseline PDF: {e}")
            
            try:
                if renewal_s3_key:
                    s3_service.delete_file(renewal_s3_key)
                    logger.info(f"[{job_id}] Deleted renewal PDF from S3: {renewal_s3_key}")
            except Exception as e:
                logger.error(f"[{job_id}] Failed to delete renewal PDF: {e}")
            
            logger.info(f"[{job_id}] Cleanup completed")


# Global processor instance
analysis_processor = AnalysisProcessor()

