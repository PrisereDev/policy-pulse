"""
Script to inspect backend analysis results and identify problematic fields.
"""
import requests
import json
import sys

def inspect_result(job_id):
    """Fetch and inspect an analysis result for problematic fields."""
    
    url = f"https://prisere-backend.onrender.com/v1/analyses/{job_id}/result"
    
    print(f"Fetching result for job: {job_id}")
    print(f"URL: {url}")
    print("-" * 80)
    
    try:
        response = requests.get(url)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Error: HTTP {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return None
        
        result = response.json()
        
        # Print raw JSON structure
        print("\n=== RAW JSON RESPONSE ===")
        print(json.dumps(result, indent=2))
        print("\n" + "=" * 80)
        
        # Analyze changes array
        changes = result.get("changes", [])
        print(f"\n=== CHANGES ANALYSIS ===")
        print(f"Total changes: {len(changes)}")
        print("-" * 80)
        
        problematic_count = 0
        
        for idx, change in enumerate(changes):
            issues = []
            
            # Check baseline_value
            if change.get("baseline_value") is None:
                issues.append("baseline_value=None")
            
            # Check renewal_value
            if change.get("renewal_value") is None:
                issues.append("renewal_value=None")
            
            # Check page_references
            page_refs = change.get("page_references")
            if page_refs is None:
                issues.append("page_references=None")
            else:
                baseline_pages = page_refs.get("baseline")
                renewal_pages = page_refs.get("renewal")
                
                if baseline_pages is None:
                    issues.append("page_references.baseline=None")
                elif not isinstance(baseline_pages, list):
                    issues.append(f"page_references.baseline=NOT_A_LIST (type: {type(baseline_pages).__name__})")
                
                if renewal_pages is None:
                    issues.append("page_references.renewal=None")
                elif not isinstance(renewal_pages, list):
                    issues.append(f"page_references.renewal=NOT_A_LIST (type: {type(renewal_pages).__name__})")
            
            # Check other important fields
            for field in ["category", "change_type", "title", "description"]:
                if change.get(field) is None:
                    issues.append(f"{field}=None")
            
            # Check numeric fields
            if change.get("percentage_change") is None:
                issues.append("percentage_change=None")
            
            if change.get("confidence") is None:
                issues.append("confidence=None")
            
            # Print change summary
            if issues:
                problematic_count += len(issues)
                print(f"\n❌ Change {idx}: {len(issues)} issues")
                for issue in issues:
                    print(f"   - {issue}")
            else:
                print(f"\n✅ Change {idx}: No issues")
            
            # Print abbreviated change info
            print(f"   Title: {change.get('title', 'N/A')}")
            print(f"   Category: {change.get('category', 'N/A')}")
            print(f"   Baseline: {change.get('baseline_value', 'N/A')}")
            print(f"   Renewal: {change.get('renewal_value', 'N/A')}")
        
        # Check top-level fields
        print("\n" + "=" * 80)
        print("=== TOP-LEVEL FIELDS ===")
        
        summary = result.get("summary")
        if summary:
            print(f"✅ summary: {summary}")
        else:
            print("❌ summary: None")
            problematic_count += 1
        
        premium = result.get("premium_comparison")
        if premium:
            print(f"✅ premium_comparison: {premium}")
            # Check premium fields
            for key in ["baseline_premium", "renewal_premium", "difference", "percentage_change"]:
                if premium.get(key) is None:
                    print(f"   ⚠️  {key}=None (this is OK if premiums weren't found)")
        else:
            print("❌ premium_comparison: None")
            problematic_count += 1
        
        metadata = result.get("metadata")
        if metadata:
            print(f"✅ metadata: {metadata}")
            if metadata.get("completed_at") is None:
                print("   ❌ metadata.completed_at=None")
                problematic_count += 1
        else:
            print("❌ metadata: None")
            problematic_count += 1
        
        # Summary
        print("\n" + "=" * 80)
        print(f"=== SUMMARY ===")
        print(f"Total problematic fields: {problematic_count}")
        
        if problematic_count == 0:
            print("✅ No issues found - result is well-formed")
        else:
            print("❌ Issues found - may cause frontend errors or serialization failures")
        
        return result
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"❌ JSON parsing failed: {e}")
        print(f"Raw response: {response.text[:500]}")
        return None
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    # Test multiple jobs
    jobs_to_test = [
        "91a5977f-6c16-448f-b416-1ceda8f58a38",  # 4 changes - fails with 500
        "f31718f9-1987-42a0-996b-d42a0338adc7",  # 1 change - works
        "a9ee9448-4ba7-4556-9fe4-b8892eb9a3ed",  # 4 changes - fails with 500
    ]
    
    for job_id in jobs_to_test:
        result = inspect_result(job_id)
        print("\n" + "=" * 80)
        print("=" * 80)
        print()
        if result is None:
            print(f"⚠️  Skipping to next job due to error\n")


