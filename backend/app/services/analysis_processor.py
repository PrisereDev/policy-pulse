"""
Background analysis processor for comparing insurance policies.
"""
import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import traceback

from app.database import get_db_context
from app.models.analysis_job import AnalysisJob, JobStatus
from app.models.analysis_result import AnalysisResult
from app.services.s3_service import s3_service
from app.services.pdf_service import pdf_service
from app.services.claude_service import claude_service

logger = logging.getLogger(__name__)


def _extract_business_name_from_policy_text(policy_text: str) -> Optional[str]:
    """
    Regex fallback when the model omits LLC/Inc: many PDFs use a 'Business Name'
    row (e.g. Hiscox) that must win over a personal 'Name' field.
    """
    if not policy_text or not policy_text.strip():
        return None
    for pat in (
        r"(?i)business\s+name\s*[:#]?\s*([^\n\r]+)",
        r"(?i)company\s+name\s*[:#]?\s*([^\n\r]+)",
    ):
        m = re.search(pat, policy_text)
        if m:
            candidate = m.group(1).strip()
            candidate = re.sub(r"\s+", " ", candidate)
            if len(candidate) >= 2 and candidate.upper() != "UNKNOWN":
                return candidate[:300]
    return None


def _looks_like_company_entity(s: str) -> bool:
    u = s.upper()
    return any(
        x in u
        for x in (
            "LLC",
            "INC",
            "CORP",
            "L.L.C.",
            " LLP",
            " LP",
            "LTD",
            "PLLC",
            "COMPANY",
        )
    )


def _merge_named_insured(
    ai_raw: Optional[str], policy_text: str
) -> Optional[str]:
    """Prefer Business Name/Company Name from text if AI returned only a person name."""
    ai = None
    if ai_raw is not None:
        s = str(ai_raw).strip()
        if s and s.upper() != "UNKNOWN":
            ai = s

    from_text = _extract_business_name_from_policy_text(policy_text)

    if from_text and not ai:
        return from_text
    if from_text and ai and from_text.strip().upper() != ai.strip().upper():
        if _looks_like_company_entity(from_text) and not _looks_like_company_entity(ai):
            logger.info(
                "Using Business Name/Company Name from policy text over AI named_insured "
                "(entity vs individual): %r -> %r",
                ai,
                from_text,
            )
            return from_text
    return ai


class AnalysisProcessor:
    """Process analysis jobs in the background."""

    async def process_analysis_job(self, job_id: str) -> None:
        """Runs comparison work in a worker thread so the event loop can serve /status polls."""
        await asyncio.to_thread(self._process_analysis_job_sync, job_id)

    def _process_analysis_job_sync(self, job_id: str) -> None:
        """
        Process a single analysis job (blocking; invoked via asyncio.to_thread).

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
                job.update_progress(5, "Preparing your comparison...")
                db.commit()
                
                logger.info(f"Starting analysis job: {job_id}")
                logger.info(f"Baseline: {baseline_s3_key}")
                logger.info(f"Renewal: {renewal_s3_key}")
            
            # Step 1: Download baseline PDF from S3
            logger.info(f"[{job_id}] Downloading baseline PDF from S3...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(10, "Downloading your current policy...")
                db.commit()
            
            baseline_bytes = s3_service.download_file_content(baseline_s3_key)
            logger.info(f"[{job_id}] Downloaded baseline PDF: {len(baseline_bytes)} bytes")
            
            # Step 2: Download renewal PDF from S3
            logger.info(f"[{job_id}] Downloading renewal PDF from S3...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(20, "Downloading your renewal policy...")
                db.commit()
            
            renewal_bytes = s3_service.download_file_content(renewal_s3_key)
            logger.info(f"[{job_id}] Downloaded renewal PDF: {len(renewal_bytes)} bytes")
            
            # Step 3: Extract text from baseline PDF
            logger.info(f"[{job_id}] Extracting text from baseline PDF...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(30, "Extracting text from your current policy...")
                db.commit()
            
            baseline_result = pdf_service.extract_text_with_metadata(baseline_bytes)
            baseline_text = baseline_result['text']
            baseline_metadata = baseline_result['metadata']
            
            logger.info(f"[{job_id}] Extracted baseline text: {len(baseline_text)} characters, {baseline_metadata['page_count']} pages")
            
            # Step 4: Extract text from renewal PDF
            logger.info(f"[{job_id}] Extracting text from renewal PDF...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(40, "Extracting text from your renewal policy...")
                db.commit()
            
            renewal_result = pdf_service.extract_text_with_metadata(renewal_bytes)
            renewal_text = renewal_result['text']
            renewal_metadata = renewal_result['metadata']
            
            logger.info(f"[{job_id}] Extracted renewal text: {len(renewal_text)} characters, {renewal_metadata['page_count']} pages")
            
            # Step 5: Compare policies using Claude API
            logger.info(f"[{job_id}] Comparing policies with Claude AI...")
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(50, "Analyzing policy differences...")
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
                job.update_progress(90, "Finalizing analysis...")
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


    async def process_gap_analysis_job(self, job_id: str) -> None:
        """Runs gap analysis work in a worker thread so the event loop can serve /status polls."""
        await asyncio.to_thread(self._process_gap_analysis_job_sync, job_id)

    def _process_gap_analysis_job_sync(self, job_id: str) -> None:
        """
        Process a gap analysis job: single policy + risk profile -> coverage gaps.
        """
        start_time = datetime.now(timezone.utc)
        policy_s3_key = None

        try:
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                if not job:
                    logger.error(f"Job not found: {job_id}")
                    return

                policy_s3_key = job.baseline_s3_key
                job.mark_processing()
                job.update_progress(5, "Preparing your analysis...")
                db.commit()

            # Download policy PDF
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(15, "Downloading policy from S3...")
                db.commit()

            policy_bytes = s3_service.download_file_content(policy_s3_key)
            logger.info(f"[{job_id}] Downloaded policy PDF: {len(policy_bytes)} bytes")

            # Extract text
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(30, "Extracting text from policy...")
                db.commit()

            policy_result = pdf_service.extract_text_with_metadata(policy_bytes)
            policy_text = policy_result["text"]
            logger.info(f"[{job_id}] Extracted policy text: {len(policy_text)} characters")

            # Run Claude gap analysis
            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                risk_profile = job.risk_profile_data
                job.update_progress(50, "Analyzing policy differences...")
                db.commit()

            claude_data = claude_service.analyze_gap_coverage(
                policy_text, risk_profile=risk_profile
            )
            logger.info(f"[{job_id}] Claude gap analysis completed")

            # Build gap items from coverage_gaps + endorsement_recommendations
            gaps = []
            for gap in claude_data.get("coverage_gaps", []):
                gap_item = {
                    "type": gap.get("risk", "unknown"),
                    "status": "not_covered",
                    "title": gap.get("risk", ""),
                    "explanation": gap.get("why_gap_exists", ""),
                }
                affected = gap.get("affected_locations", [])
                if affected:
                    gap_item["affected_locations"] = affected
                gaps.append(gap_item)

            recommendations = []
            for rec in claude_data.get("endorsement_recommendations", []):
                recommendations.append(
                    f"[{rec.get('priority', 'MEDIUM')}] {rec.get('endorsement_name', '')}: "
                    f"{rec.get('reason_for_recommendation', '')}"
                )

            policy_data = claude_data.get("policy_data", {})
            policy_meta = policy_data.get("policy_metadata", {}) if isinstance(policy_data, dict) else {}
            if not isinstance(policy_meta, dict):
                policy_meta = {}

            def _normalize_named_insured(raw) -> Optional[str]:
                if raw is None:
                    return None
                s = str(raw).strip()
                if not s or s.upper() == "UNKNOWN":
                    return None
                return s

            def _normalize_expiration_raw(raw) -> Optional[str]:
                if raw is None:
                    return None
                s = str(raw).strip()
                if not s or s.upper() == "UNKNOWN":
                    return None
                return s

            named_insured = _merge_named_insured(
                policy_meta.get("named_insured"), policy_text
            )
            named_insured = _normalize_named_insured(named_insured)
            policy_expiration_raw = _normalize_expiration_raw(
                policy_meta.get("effective_dates")
            )

            processing_time = int((datetime.now(timezone.utc) - start_time).total_seconds())

            # Save result as JSON in AnalysisResult
            gap_result_payload = {
                "gaps": gaps,
                "business_name": named_insured,
                "policy_expiration_date": policy_expiration_raw,
                "summary": f"Found {len(gaps)} coverage gap(s) with {len(recommendations)} endorsement recommendation(s).",
                "recommendations": recommendations,
            }

            # Persist gap-only fields (named insured, expiry) for GET /gap-result — stored
            # here because AnalysisResult has no dedicated columns for gap metadata.
            gap_meta_insight = {
                "change_type": "gap_policy_metadata",
                "insight": "",
                "business_name": named_insured,
                "policy_expiration_date": policy_expiration_raw,
            }

            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.update_progress(90, "Finalizing analysis...")
                db.commit()

            with get_db_context() as db:
                analysis_result = AnalysisResult(
                    job_id=job_id,
                    total_changes=len(gaps),
                    change_categories={"coverage_gap": len(gaps)},
                    changes=gap_result_payload.get("gaps", []),
                    premium_comparison=None,
                    suggested_actions=[{"action": r} for r in recommendations],
                    educational_insights=[gap_meta_insight],
                    model_version=claude_service.model,
                    processing_time_seconds=processing_time,
                )
                db.add(analysis_result)
                db.commit()

            with get_db_context() as db:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                job.mark_completed()
                db.commit()

            logger.info(f"[{job_id}] Gap analysis completed in {processing_time}s")

        except Exception as e:
            logger.error(f"[{job_id}] Gap analysis failed: {e}")
            logger.error(traceback.format_exc())
            try:
                with get_db_context() as db:
                    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                    if job:
                        job.mark_failed(f"Gap analysis failed: {str(e)}")
                        db.commit()
            except Exception as db_error:
                logger.error(f"[{job_id}] Failed to mark job as failed: {db_error}")

        finally:
            try:
                if policy_s3_key:
                    s3_service.delete_file(policy_s3_key)
                    logger.info(f"[{job_id}] Deleted policy PDF from S3")
            except Exception as e:
                logger.error(f"[{job_id}] Failed to delete policy PDF: {e}")


# Global processor instance
analysis_processor = AnalysisProcessor()

