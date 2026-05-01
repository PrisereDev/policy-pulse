"""
Script to connect directly to PostgreSQL and inspect analysis results.
This bypasses the API to see the raw data that's causing serialization errors.
"""
import os
import json
from sqlalchemy import create_engine, text

def inspect_database_result(job_id, database_url):
    """Inspect a result directly from the database."""
    
    print(f"Connecting to database...")
    print(f"Job ID: {job_id}")
    print("-" * 80)
    
    try:
        engine = create_engine(database_url)
        
        with engine.connect() as conn:
            # Query the analysis_results table
            query = text("""
                SELECT 
                    job_id,
                    total_changes,
                    change_categories,
                    changes,
                    premium_comparison,
                    suggested_actions,
                    educational_insights,
                    confidence_score,
                    analysis_version,
                    model_version,
                    processing_time_seconds,
                    created_at
                FROM analysis_results
                WHERE job_id = :job_id
            """)
            
            result = conn.execute(query, {"job_id": job_id})
            row = result.fetchone()
            
            if not row:
                print(f"❌ No result found for job_id: {job_id}")
                return None
            
            print("✅ Result found in database\n")
            
            # Convert row to dict
            columns = result.keys()
            result_dict = dict(zip(columns, row))
            
            # Print raw database values
            print("=== RAW DATABASE VALUES ===")
            for key, value in result_dict.items():
                if key == "changes":
                    print(f"\n{key}: (JSON array with {len(value) if value else 0} items)")
                    if value:
                        print(json.dumps(value, indent=2))
                elif key == "premium_comparison":
                    print(f"\n{key}:")
                    print(json.dumps(value, indent=2))
                elif isinstance(value, dict):
                    print(f"\n{key}: {json.dumps(value, indent=2)}")
                else:
                    print(f"{key}: {value}")
            
            # Analyze changes for problematic fields
            print("\n" + "=" * 80)
            print("=== CHANGES ANALYSIS ===")
            
            changes = result_dict.get("changes") or []
            print(f"Total changes: {len(changes)}")
            print("-" * 80)
            
            problematic_count = 0
            
            for idx, change in enumerate(changes):
                issues = []
                
                # Check all fields
                for field in [
                    "category", "change_type", "title", "description",
                    "baseline_value", "renewal_value", "change_amount",
                    "percentage_change", "confidence", "page_references"
                ]:
                    value = change.get(field)
                    
                    if value is None:
                        issues.append(f"{field}=None")
                    elif field == "page_references" and isinstance(value, dict):
                        # Check nested fields
                        baseline_pages = value.get("baseline")
                        renewal_pages = value.get("renewal")
                        
                        if baseline_pages is None:
                            issues.append("page_references.baseline=None")
                        if renewal_pages is None:
                            issues.append("page_references.renewal=None")
                
                # Print change summary
                if issues:
                    problematic_count += len(issues)
                    print(f"\n❌ Change {idx}: {len(issues)} issues")
                    for issue in issues:
                        print(f"   - {issue}")
                    
                    # Print full change object for debugging
                    print(f"\n   Full change object:")
                    print(json.dumps(change, indent=4))
                else:
                    print(f"\n✅ Change {idx}: No issues")
                    print(f"   Title: {change.get('title', 'N/A')}")
            
            # Check created_at
            print("\n" + "=" * 80)
            print("=== CRITICAL FIELDS ===")
            
            if result_dict.get("created_at") is None:
                print("❌ created_at=None (will crash .isoformat())")
                problematic_count += 1
            else:
                print(f"✅ created_at={result_dict['created_at']}")
            
            # Summary
            print("\n" + "=" * 80)
            print(f"=== SUMMARY ===")
            print(f"Total problematic fields: {problematic_count}")
            
            if problematic_count == 0:
                print("✅ No obvious issues - the error must be in serialization logic")
            else:
                print("❌ These fields are likely causing the 500 error")
            
            return result_dict
            
    except Exception as e:
        print(f"❌ Database error: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    # Get DATABASE_URL from environment or prompt
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        print("=" * 80)
        print("DATABASE_URL not found in environment.")
        print("=" * 80)
        print("\nTo use this script:")
        print("1. Go to Render Dashboard → Your PostgreSQL Database")
        print("2. Copy the 'Internal Database URL' or 'External Database URL'")
        print("3. Run:")
        print('   $env:DATABASE_URL="postgresql://user:pass@host:port/db"')
        print("   python inspect_database.py")
        print("\nOr provide it inline:")
        print('   $env:DATABASE_URL="postgresql://..."; python inspect_database.py')
        exit(1)
    
    # Jobs to inspect
    jobs_to_test = [
        "91a5977f-6c16-448f-b416-1ceda8f58a38",  # Fails with 500
        "a9ee9448-4ba7-4556-9fe4-b8892eb9a3ed",  # Fails with 500
    ]
    
    for job_id in jobs_to_test:
        inspect_database_result(job_id, database_url)
        print("\n" + "=" * 80)
        print("=" * 80)
        print()


