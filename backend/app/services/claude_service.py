"""
Claude AI service for comparing insurance policies.
"""
import json
import logging
import re
from typing import Dict, Any, Optional

from anthropic import Anthropic

from app.config import settings

logger = logging.getLogger(__name__)


class ClaudeService:
    """Service for interacting with Claude AI for policy comparison."""
    
    def __init__(self):
        """Initialize Claude client with API key from settings."""
        self.client = Anthropic(api_key=settings.anthropic_api_key)
        self.model = settings.anthropic_model
        self.temperature = 0  # Deterministic output for structured JSON
        self.max_tokens = 4096  # Max for Haiku/Sonnet (Claude 3.5 Sonnet supports 8192)
    
    def build_comparison_prompt(self, baseline_text: str, renewal_text: str) -> str:
        """
        Build detailed prompt for Claude to compare two policies.
        
        Args:
            baseline_text: Text from the current/baseline policy
            renewal_text: Text from the renewal policy
            
        Returns:
            str: Formatted prompt for Claude
        """
        prompt = f"""You are an expert insurance policy analyst. Compare these two insurance policies and identify all significant changes between them.

BASELINE POLICY (Current):
{baseline_text}

RENEWAL POLICY (New):
{renewal_text}

Analyze these policies carefully and return your analysis as a JSON object with the following structure:

{{
  "summary": "A brief 2-3 sentence overview of the main changes between the policies",
  
  "coverage_changes": [
    {{
      "category": "coverage_limit | deductible | exclusion | premium | terms_conditions | other",
      "change_type": "increased | decreased | added | removed | modified",
      "title": "Brief title of the change (e.g., 'General Liability Limit Decreased')",
      "description": "Detailed explanation of what changed",
      "baseline_value": "Value or description in the baseline policy",
      "renewal_value": "Value or description in the renewal policy",
      "change_amount": "Quantified change if applicable (e.g., '-$1,000,000' or '+$500')",
      "percentage_change": 10.5,
      "confidence": 0.95,
      "page_references": {{
        "baseline": [12, 15],
        "renewal": [11, 14]
      }}
    }}
  ],
  
  "premium_comparison": {{
    "baseline_premium": 15000,
    "renewal_premium": 16500,
    "difference": 1500,
    "percentage_change": 10.0
  }},
  
  "broker_questions": [
    "Why was the general liability limit reduced from $2M to $1M?",
    "Is there a reason for the deductible increase?",
    "Are there any additional endorsements that should be considered?"
  ]
}}

IMPORTANT INSTRUCTIONS:
1. Be thorough - identify ALL significant changes, not just major ones
2. Include specific dollar amounts, percentages, and limits when available
3. Reference page numbers where you found each change
4. For coverage_changes:
   - Use appropriate category (coverage_limit, deductible, exclusion, premium, terms_conditions, other)
   - Use appropriate change_type (increased, decreased, added, removed, modified)
   - Include confidence score (0.0 to 1.0) based on how certain you are
   - Provide specific baseline_value and renewal_value for comparison
5. For premium_comparison:
   - Extract exact premium amounts from both policies (only use numbers explicitly stated in the documents)
   - Calculate the difference and percentage change
   - If premium is not found or unclear, use null — do not infer or invent amounts
6. For broker_questions:
   - Generate 3-5 actionable questions the broker should ask
   - Focus on clarifying ambiguities or concerning changes
   - Be specific and reference the actual policy changes

Return ONLY the JSON object, no additional text or explanation.
"""
        return prompt
    
    def compare_policies(
        self,
        baseline_text: str,
        renewal_text: str,
        baseline_metadata: Optional[Dict[str, Any]] = None,
        renewal_metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Compare two insurance policies using Claude AI.
        
        Args:
            baseline_text: Text from the current/baseline policy
            renewal_text: Text from the renewal policy
            baseline_metadata: Optional metadata from baseline PDF
            renewal_metadata: Optional metadata from renewal PDF
            
        Returns:
            dict: Structured comparison results with summary, changes, premium comparison, and questions
            
        Raises:
            Exception: If Claude API call fails or response is invalid
        """
        try:
            logger.info("Building comparison prompt...")
            
            # Build prompt
            prompt = self.build_comparison_prompt(baseline_text, renewal_text)
            
            logger.info(f"Calling Claude API (model: {self.model}, temperature: {self.temperature})...")
            logger.info(f"Prompt length: {len(prompt)} characters")
            
            # Call Claude API using messages API (required for Claude 3 models)
            message = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )
            
            # Extract response text
            response_text = message.content[0].text
            
            logger.info(f"Received Claude response ({len(response_text)} characters)")
            logger.info(f"Usage: {message.usage.input_tokens} input tokens, {message.usage.output_tokens} output tokens")
            
            # Parse JSON response
            comparison_result = self._parse_json_response(response_text)
            
            # Validate response structure
            self._validate_comparison_result(comparison_result)
            
            # Add metadata if available
            if baseline_metadata or renewal_metadata:
                comparison_result["metadata"] = {
                    "baseline_pages": baseline_metadata.get("page_count") if baseline_metadata else None,
                    "renewal_pages": renewal_metadata.get("page_count") if renewal_metadata else None,
                    "model_version": self.model,
                    "temperature": self.temperature
                }
            
            logger.info("Successfully parsed and validated comparison result")
            
            return comparison_result
            
        except Exception as e:
            logger.error(f"Failed to compare policies: {e}")
            raise Exception(f"Failed to compare policies: {str(e)}")
    
    def _parse_json_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parse JSON from Claude's response, handling markdown code blocks.
        
        Args:
            response_text: Raw response text from Claude
            
        Returns:
            dict: Parsed JSON object
            
        Raises:
            Exception: If JSON parsing fails
        """
        try:
            # Check if response is wrapped in markdown code blocks
            # Pattern: ```json ... ``` or ``` ... ```
            json_pattern = r"```(?:json)?\s*\n(.*?)\n```"
            match = re.search(json_pattern, response_text, re.DOTALL)
            
            if match:
                # Extract JSON from code block
                json_str = match.group(1)
                logger.info("Extracted JSON from markdown code block")
            else:
                # Use response as-is
                json_str = response_text.strip()
            
            # Parse JSON
            result = json.loads(json_str)
            
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            logger.error(f"Response text: {response_text[:500]}...")
            raise Exception(f"Failed to parse JSON response: {str(e)}")
    
    def _validate_comparison_result(self, result: Dict[str, Any]) -> None:
        """
        Validate that comparison result has required structure.
        
        Args:
            result: Parsed comparison result
            
        Raises:
            Exception: If result is missing required fields or has invalid structure
        """
        # Required top-level fields
        required_fields = ["summary", "coverage_changes", "premium_comparison", "broker_questions"]
        
        for field in required_fields:
            if field not in result:
                raise Exception(f"Missing required field: {field}")
        
        # Validate types
        if not isinstance(result["summary"], str):
            raise Exception("summary must be a string")
        
        if not isinstance(result["coverage_changes"], list):
            raise Exception("coverage_changes must be an array")
        
        if not isinstance(result["premium_comparison"], dict):
            raise Exception("premium_comparison must be an object")
        
        if not isinstance(result["broker_questions"], list):
            raise Exception("broker_questions must be an array")
        
        # Validate coverage_changes structure
        for idx, change in enumerate(result["coverage_changes"]):
            if not isinstance(change, dict):
                raise Exception(f"coverage_changes[{idx}] must be an object")
            
            # Required fields in each change
            required_change_fields = [
                "category", "change_type", "title", "description",
                "baseline_value", "renewal_value"
            ]
            
            for field in required_change_fields:
                if field not in change:
                    logger.warning(f"coverage_changes[{idx}] missing field: {field}")
        
        # Validate premium_comparison structure
        if "baseline_premium" not in result["premium_comparison"]:
            logger.warning("premium_comparison missing baseline_premium")
        
        if "renewal_premium" not in result["premium_comparison"]:
            logger.warning("premium_comparison missing renewal_premium")
        
        logger.info("Comparison result validation passed")


# Global Claude service instance
claude_service = ClaudeService()

