#!/usr/bin/env python
"""
Test upload API endpoints.
"""
import sys
import os
import requests

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import settings


def test_upload_endpoints():
    """Test upload API endpoints."""
    base_url = f"http://localhost:{settings.port}"
    
    print("=" * 60)
    print("Upload API Test")
    print("=" * 60)
    print()
    
    print(f"Base URL: {base_url}")
    print()
    
    # Test 1: Initialize upload
    print("1. Testing POST /v1/uploads/init...")
    try:
        response = requests.post(
            f"{base_url}/v1/uploads/init",
            json={
                "file_type": "application/pdf",
                "filename": "test-policy.pdf"
            }
        )
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Success!")
            print(f"   S3 Key: {data['s3_key']}")
            print(f"   Upload URL: {data['upload_url'][:60]}...")
            print(f"   Expires at: {data['expires_at']}")
            print(f"   Max file size: {data['max_file_size_mb']}MB")
            print()
            
            # Save s3_key for verification test
            s3_key = data['s3_key']
            
            # Test 2: Verify upload (should fail since we didn't actually upload)
            print("2. Testing GET /v1/uploads/verify/{s3_key}...")
            verify_response = requests.get(
                f"{base_url}/v1/uploads/verify/{s3_key}"
            )
            print(f"   Status: {verify_response.status_code}")
            
            if verify_response.status_code == 404:
                print(f"Expected 404 (file not uploaded yet)")
            else:
                print(f"   Response: {verify_response.json()}")
            print()
            
        else:
            print(f"Failed: {response.text}")
            print()
    
    except Exception as e:
        print(f"Error: {e}")
        print()
    
    # Test 3: Invalid file type
    print("3. Testing with invalid file type...")
    try:
        response = requests.post(
            f"{base_url}/v1/uploads/init",
            json={
                "file_type": "image/png",
                "filename": "test.png"
            }
        )
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 422:
            print(f"   ✅ Expected 422 (validation error)")
        else:
            print(f"   Response: {response.json()}")
        print()
    
    except Exception as e:
        print(f"   ❌ Error: {e}")
        print()
    
    # Test 4: Invalid filename extension
    print("4. Testing with invalid filename extension...")
    try:
        response = requests.post(
            f"{base_url}/v1/uploads/init",
            json={
                "file_type": "application/pdf",
                "filename": "test.docx"
            }
        )
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 422:
            print(f"   ✅ Expected 422 (validation error)")
        else:
            print(f"   Response: {response.json()}")
        print()
    
    except Exception as e:
        print(f"   ❌ Error: {e}")
        print()
    
    print("=" * 60)
    print("Tests complete!")
    print()
    print("To test actual file upload:")
    print("1. Use the upload_url from the init response")
    print("2. POST the file with the fields provided")
    print("3. Then verify with GET /v1/uploads/verify/{s3_key}")


if __name__ == "__main__":
    # Check if server is running
    try:
        response = requests.get(f"http://localhost:{settings.port}/health")
        if response.status_code != 200:
            print("❌ Server is not running properly")
            print("Start server: python -m app.main")
            sys.exit(1)
    except Exception:
        print("❌ Cannot connect to server")
        print("Start server: python -m app.main")
        sys.exit(1)
    
    test_upload_endpoints()

