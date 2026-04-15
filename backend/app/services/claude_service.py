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
    
    def analyze_gap_coverage(
        self,
        policy_text: str,
        risk_profile: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Analyze a single insurance policy for coverage gaps and endorsement
        recommendations using Claude AI.

        Args:
            policy_text: Extracted text from the policy PDF
            risk_profile: Optional risk-profile data from onboarding

        Returns:
            dict with keys: policy_data, operational_risk_factors,
                            coverage_gaps, endorsement_recommendations

        Raises:
            Exception: If Claude API call fails or response is invalid
        """
        try:
            risk_section = ""
            if risk_profile:
                locations = risk_profile.get("business_locations", [])
                profile_for_prompt = {
                    k: v for k, v in risk_profile.items() if k != "business_locations"
                }
                risk_section = (
                    "\n\nADDITIONAL CONTEXT — RISK PROFILE FROM BUSINESS OWNER:\n"
                    f"{json.dumps(profile_for_prompt, indent=2)}\n"
                    "Use this risk profile to cross-reference against the policy "
                    "when identifying coverage gaps.\n"
                )
                if locations:
                    formatted = ", ".join(
                        f"{loc['address']}{' (primary)' if loc.get('isPrimary') else ''}"
                        for loc in locations
                    )
                    risk_section += (
                        f"\nBUSINESS LOCATIONS:\n{formatted}\n"
                        "Consider location-specific risks (e.g. flood zones, earthquake "
                        "zones, coastal exposure) for EACH location individually.\n"
                    )

            prompt = f"""You are an insurance underwriting analyst AI.

Your task is to read the commercial insurance policy document below and:

1) Extract structured policy and business data
2) Identify coverage gaps and operational risk dependencies
3) Recommend appropriate endorsements
4) Justify each recommendation using evidence from the document

IMPORTANT RULES:
- Do NOT summarize the document.
- Extract factual data first, then perform risk analysis.
- If information is missing, mark as "UNKNOWN" — do not guess or invent numbers.
- You MUST return ONLY a single valid JSON object — no markdown, no commentary.
- If the document is unreadable or empty, still return the JSON structure with
  empty arrays and "UNKNOWN" values. Never return an empty response.

NAMED INSURED / COMPANY NAME (policy_data.policy_metadata.named_insured):
- This field is shown in the app as the customer's **business name**. It must be
  the legal **business entity** when one is stated (e.g. "Prisere LLC"), not only
  an individual person's name when both appear.
- Scan the full document including: declarations, "Your business details" or
  similar tables, schedules, policy jacket, and ACORD-style forms.
- Many carriers (e.g. Hiscox, biBerk) use a row or label **"Business Name"** or
  **"Company Name"** next to the LLC/Inc name — use THAT value for
  `named_insured` when present, even if a separate **"Name"** row shows an
  individual (e.g. owner). Prefer **Business Name / Company Name** over a
  personal name alone when both exist.
- Also match labels: "Named insured", "Insured", "Name of insured", "DBA".
- Copy the name exactly as written; only trim leading/trailing whitespace.
- If multiple entities are listed, use the primary operating company for the policy.
- If no clear business or named insured appears, set "named_insured" to "" (not "UNKNOWN").
{risk_section}
----- BEGIN POLICY DOCUMENT -----
{policy_text}
----- END POLICY DOCUMENT -----

Return a JSON object with exactly this structure:

{{
  "policy_data": {{
    "policy_metadata": {{
      "policy_type": "",
      "named_insured": "",
      "effective_dates": "",
      "locations_insured": [],
      "industry_description": "",
      "naics_or_class_code": ""
    }},
    "coverages_present": {{
      "property": false,
      "general_liability": false,
      "business_interruption": false,
      "extra_expense": false,
      "equipment_breakdown": false,
      "cyber": false,
      "flood": false,
      "earthquake": false
    }},
    "limits_and_deductibles": {{
      "property_limit": "",
      "liability_limit": "",
      "business_interruption_limit": "",
      "deductibles": "",
      "waiting_period_bi": ""
    }},
    "sublimits": {{
      "spoilage": "",
      "electronics": "",
      "signage": "",
      "other": []
    }},
    "exclusions_detected": [],
    "endorsements_already_attached": []
  }},

  "operational_risk_factors": {{
    "handles_perishable_goods": false,
    "relies_on_refrigeration": false,
    "hosts_events_or_depends_on_events": false,
    "provides_professional_services_or_advice": false,
    "handles_sensitive_customer_data": false,
    "depends_heavily_on_utilities": false,
    "uses_specialized_equipment_or_machinery": false,
    "single_location_dependency": false
  }},

  "coverage_gaps": [
    {{
      "risk": "",
      "why_gap_exists": "",
      "evidence_from_policy": "",
      "affected_locations": []
    }}
  ],

  "endorsement_recommendations": [
    {{
      "endorsement_name": "",
      "priority": "HIGH",
      "reason_for_recommendation": "",
      "risk_if_not_added": "",
      "evidence_from_document": ""
    }}
  ]
}}

LOCATION ATTRIBUTION RULES for coverage_gaps:
- "affected_locations" is an array of address strings from the BUSINESS LOCATIONS list.
- If a gap applies to ALL locations (or the risk is not location-specific), set
  "affected_locations" to an empty array [].
- If a gap applies only to SPECIFIC locations (e.g. one address is in a flood zone
  but another is not), list ONLY the affected address strings.

Allowed endorsements: Utility Service Interruption, Spoilage Coverage,
Event Cancellation, Errors & Omissions (E&O), Cyber Liability,
Equipment Breakdown, Contingent Business Interruption, Flood (separate policy),
Ordinance or Law, Data Breach Response.

Priority logic:
  HIGH   = Business operations depend on this exposure AND policy does not cover it
  MEDIUM = Partial coverage or moderate exposure
  LOW    = Edge-case or limited exposure

Return ONLY the JSON object. No markdown fences, no explanation."""

            logger.info(f"Calling Claude API for gap analysis (model: {self.model})")
            logger.info(f"Gap analysis prompt length: {len(prompt)} characters")

            message = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text if message.content else ""

            logger.info(
                f"Claude gap analysis raw response length: {len(response_text)} chars"
            )
            logger.debug(
                f"Claude gap analysis raw response (first 500 chars): "
                f"{response_text[:500]}"
            )

            if not response_text or not response_text.strip():
                raise Exception(
                    "Claude returned an empty response for gap analysis. "
                    f"Stop reason: {message.stop_reason}, "
                    f"usage: {message.usage.input_tokens} in / "
                    f"{message.usage.output_tokens} out"
                )

            logger.info(
                f"Usage: {message.usage.input_tokens} input tokens, "
                f"{message.usage.output_tokens} output tokens"
            )

            parsed = self._parse_json_response(response_text)
            return parsed

        except Exception as e:
            logger.error(f"Gap analysis Claude call failed: {e}")
            raise Exception(f"Gap analysis failed: {str(e)}")
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

