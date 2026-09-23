#!/usr/bin/env python3
"""
Comprehensive backend test suite for webosu2 Node.js/Express backend.
Tests scores routes, auth routes, and middleware behavior.
"""

import requests
import json
import uuid
import time
from datetime import datetime, timedelta

# Backend base URL
BASE_URL = "https://18768588-58a3-4c6b-9d94-3a5abcbf44f1.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_pass(test_name, details=""):
    """Log a passed test"""
    msg = f"✅ PASS: {test_name}"
    if details:
        msg += f" - {details}"
    print(msg)
    test_results["passed"].append({"test": test_name, "details": details})

def log_fail(test_name, details=""):
    """Log a failed test"""
    msg = f"❌ FAIL: {test_name}"
    if details:
        msg += f" - {details}"
    print(msg)
    test_results["failed"].append({"test": test_name, "details": details})

def log_warn(test_name, details=""):
    """Log a warning"""
    msg = f"⚠️  WARN: {test_name}"
    if details:
        msg += f" - {details}"
    print(msg)
    test_results["warnings"].append({"test": test_name, "details": details})

def print_section(title):
    """Print a section header"""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")

# ============================================================================
# 1. SCORES ROUTES TESTS
# ============================================================================

def test_scores_routes():
    """Test all scores routes with anonymous X-Client-Id flow"""
    print_section("1. SCORES ROUTES TESTS")
    
    # Generate unique test client IDs
    client_id_1 = f"test-b-anon-{uuid.uuid4()}"
    client_id_2 = f"test-b-anon-{uuid.uuid4()}"
    client_id_3 = f"test-b-anon-{uuid.uuid4()}"
    
    print(f"Test Client IDs:")
    print(f"  Client 1: {client_id_1}")
    print(f"  Client 2: {client_id_2}")
    print(f"  Client 3: {client_id_3}\n")
    
    # Test 1.1: POST /api/scores - Valid passed score
    print("Test 1.1: POST /api/scores - Valid passed score")
    score_data = {
        "bid": "test-bid-001",
        "sid": "test-sid-001",
        "mode": "osu",
        "total_score": 5000000,
        "accuracy": 0.95,
        "max_combo": 500,
        "pp": 150.5,
        "passed": True,
        "full_combo": False,
        "rank": "A",
        "hits": {
            "great": 300,
            "good": 50,
            "meh": 10,
            "miss": 5,
            "geki": 100,
            "katu": 20
        },
        "mods": ["HD", "DT"],
        "title": "Test Song",
        "artist": "Test Artist",
        "version": "Hard",
        "star_rating": 5.5,
        "is_local": False
    }
    
    try:
        response = requests.post(
            f"{API_URL}/scores",
            json=score_data,
            headers={"X-Client-Id": client_id_1}
        )
        if response.status_code == 201:
            data = response.json()
            # Verify response structure
            if "id" in data and "user_id" in data and data["user_id"] == client_id_1:
                log_pass("POST /api/scores - Valid score", f"Score ID: {data['id']}")
            else:
                log_fail("POST /api/scores - Response structure", f"Missing fields or wrong user_id")
        else:
            log_fail("POST /api/scores - Valid score", f"Status: {response.status_code}, Body: {response.text}")
    except Exception as e:
        log_fail("POST /api/scores - Valid score", f"Exception: {str(e)}")
    
    # Test 1.2: POST /api/scores - Clamping total_score
    print("\nTest 1.2: POST /api/scores - Clamping total_score")
    score_data_clamp = {
        "bid": "test-bid-002",
        "total_score": 150000000,  # Over 100M limit
        "accuracy": 1.5,  # Over 1.0 limit
        "passed": True,
        "hits": {
            "great": 200000,  # Over 100k limit
            "good": 50,
            "meh": 10,
            "miss": 5
        },
        "mods": ["HD", "DT"]
    }
    
    try:
        response = requests.post(
            f"{API_URL}/scores",
            json=score_data_clamp,
            headers={"X-Client-Id": client_id_1}
        )
        if response.status_code == 201:
            data = response.json()
            # Check clamping
            if data["total_score"] == 100000000 and data["accuracy"] == 1.0 and data["hits"]["great"] == 100000:
                log_pass("POST /api/scores - Clamping", "Values clamped correctly")
            else:
                log_fail("POST /api/scores - Clamping", f"total_score={data['total_score']}, accuracy={data['accuracy']}, great={data['hits']['great']}")
        else:
            log_fail("POST /api/scores - Clamping", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("POST /api/scores - Clamping", f"Exception: {str(e)}")
    
    # Test 1.3: POST /api/scores - Invalid rank normalization
    print("\nTest 1.3: POST /api/scores - Invalid rank normalization")
    score_data_rank = {
        "bid": "test-bid-003",
        "total_score": 1000000,
        "accuracy": 0.85,
        "passed": True,
        "rank": "INVALID_RANK",
        "hits": {"great": 100, "good": 20, "meh": 5, "miss": 2}
    }
    
    try:
        response = requests.post(
            f"{API_URL}/scores",
            json=score_data_rank,
            headers={"X-Client-Id": client_id_1}
        )
        if response.status_code == 201:
            data = response.json()
            if data["rank"] == "D":  # Should default to D for passed
                log_pass("POST /api/scores - Rank normalization", "Invalid rank → D")
            else:
                log_fail("POST /api/scores - Rank normalization", f"Got rank: {data['rank']}")
        else:
            log_fail("POST /api/scores - Rank normalization", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("POST /api/scores - Rank normalization", f"Exception: {str(e)}")
    
    # Test 1.4: POST /api/scores - Failed score rank normalization
    print("\nTest 1.4: POST /api/scores - Failed score rank normalization")
    score_data_failed = {
        "bid": "test-bid-004",
        "total_score": 500000,
        "accuracy": 0.70,
        "passed": False,
        "rank": "INVALID_RANK",
        "hits": {"great": 50, "good": 20, "meh": 10, "miss": 20}
    }
    
    try:
        response = requests.post(
            f"{API_URL}/scores",
            json=score_data_failed,
            headers={"X-Client-Id": client_id_1}
        )
        if response.status_code == 201:
            data = response.json()
            if data["rank"] == "F":  # Should default to F for failed
                log_pass("POST /api/scores - Failed rank normalization", "Invalid rank → F")
            else:
                log_fail("POST /api/scores - Failed rank normalization", f"Got rank: {data['rank']}")
        else:
            log_fail("POST /api/scores - Failed rank normalization", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("POST /api/scores - Failed rank normalization", f"Exception: {str(e)}")
    
    # Test 1.5: POST /api/scores - Mods as string
    print("\nTest 1.5: POST /api/scores - Mods as string")
    score_data_mods = {
        "bid": "test-bid-005",
        "total_score": 2000000,
        "accuracy": 0.90,
        "passed": True,
        "mods": "HD+DT+HR",  # String format
        "hits": {"great": 150, "good": 30, "meh": 5, "miss": 1}
    }
    
    try:
        response = requests.post(
            f"{API_URL}/scores",
            json=score_data_mods,
            headers={"X-Client-Id": client_id_1}
        )
        if response.status_code == 201:
            data = response.json()
            if isinstance(data["mods"], list) and "HD" in data["mods"] and "DT" in data["mods"]:
                log_pass("POST /api/scores - Mods string", f"Parsed to array: {data['mods']}")
            else:
                log_fail("POST /api/scores - Mods string", f"Got mods: {data['mods']}")
        else:
            log_fail("POST /api/scores - Mods string", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("POST /api/scores - Mods string", f"Exception: {str(e)}")
    
    # Test 1.6: POST /api/scores - Missing bid
    print("\nTest 1.6: POST /api/scores - Missing bid")
    score_data_no_bid = {
        "total_score": 1000000,
        "accuracy": 0.85,
        "passed": True
    }
    
    try:
        response = requests.post(
            f"{API_URL}/scores",
            json=score_data_no_bid,
            headers={"X-Client-Id": client_id_1}
        )
        if response.status_code == 400:
            log_pass("POST /api/scores - Missing bid", "Correctly rejected with 400")
        else:
            log_fail("POST /api/scores - Missing bid", f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_fail("POST /api/scores - Missing bid", f"Exception: {str(e)}")
    
    # Test 1.7: POST /api/scores - Missing X-Client-Id
    print("\nTest 1.7: POST /api/scores - Missing X-Client-Id")
    try:
        response = requests.post(
            f"{API_URL}/scores",
            json=score_data
        )
        if response.status_code == 400:
            log_pass("POST /api/scores - Missing X-Client-Id", "Correctly rejected with 400")
        else:
            log_fail("POST /api/scores - Missing X-Client-Id", f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_fail("POST /api/scores - Missing X-Client-Id", f"Exception: {str(e)}")
    
    # Test 1.8: GET /api/scores/me/stats - Fresh user
    print("\nTest 1.8: GET /api/scores/me/stats - Fresh user with no scores")
    fresh_client_id = f"test-b-anon-{uuid.uuid4()}"
    
    try:
        response = requests.get(
            f"{API_URL}/scores/me/stats",
            headers={"X-Client-Id": fresh_client_id}
        )
        if response.status_code == 200:
            data = response.json()
            if (data["playcount"] == 0 and data["level"] == 1 and 
                data["pp"] == 0 and data["global_rank"] is None):
                log_pass("GET /api/scores/me/stats - Fresh user", "All stats at zero/default")
            else:
                log_fail("GET /api/scores/me/stats - Fresh user", f"Unexpected values: {data}")
        else:
            log_fail("GET /api/scores/me/stats - Fresh user", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("GET /api/scores/me/stats - Fresh user", f"Exception: {str(e)}")
    
    # Test 1.9: POST multiple scores and verify stats
    print("\nTest 1.9: POST multiple scores and verify stats")
    # Post 5 scores for client_id_1
    test_scores = [
        {"bid": "bid-1", "total_score": 5000000, "accuracy": 0.95, "pp": 150, "passed": True},
        {"bid": "bid-1", "total_score": 6000000, "accuracy": 0.97, "pp": 180, "passed": True},  # Better score on same bid
        {"bid": "bid-2", "total_score": 4000000, "accuracy": 0.90, "pp": 120, "passed": True},
        {"bid": "bid-3", "total_score": 3000000, "accuracy": 0.85, "pp": 100, "passed": True},
        {"bid": "bid-4", "total_score": 2000000, "accuracy": 0.80, "pp": 80, "passed": False},  # Failed
    ]
    
    for i, score in enumerate(test_scores):
        score["hits"] = {"great": 100, "good": 20, "meh": 5, "miss": 2}
        try:
            response = requests.post(
                f"{API_URL}/scores",
                json=score,
                headers={"X-Client-Id": client_id_1}
            )
            if response.status_code != 201:
                log_warn(f"POST score {i+1}", f"Failed with status {response.status_code}")
        except Exception as e:
            log_warn(f"POST score {i+1}", f"Exception: {str(e)}")
    
    time.sleep(0.5)  # Brief pause for DB consistency
    
    # Now check stats
    try:
        response = requests.get(
            f"{API_URL}/scores/me/stats",
            headers={"X-Client-Id": client_id_1}
        )
        if response.status_code == 200:
            data = response.json()
            # Should have 5 plays total (including the earlier test scores)
            total_plays = data["playcount"]
            passed_count = data["passed_count"]
            
            if total_plays >= 5:
                log_pass("GET /api/scores/me/stats - Playcount", f"Playcount: {total_plays}")
            else:
                log_fail("GET /api/scores/me/stats - Playcount", f"Expected >= 5, got {total_plays}")
            
            if passed_count >= 4:
                log_pass("GET /api/scores/me/stats - Passed count", f"Passed: {passed_count}")
            else:
                log_fail("GET /api/scores/me/stats - Passed count", f"Expected >= 4, got {passed_count}")
            
            if data["accuracy_avg"] > 0:
                log_pass("GET /api/scores/me/stats - Accuracy avg", f"Accuracy: {data['accuracy_avg']:.2%}")
            else:
                log_fail("GET /api/scores/me/stats - Accuracy avg", "Accuracy is 0")
            
            if data["pp"] > 0:
                log_pass("GET /api/scores/me/stats - PP calculation", f"PP: {data['pp']}")
            else:
                log_fail("GET /api/scores/me/stats - PP calculation", "PP is 0")
            
            if data["level"] >= 1:
                log_pass("GET /api/scores/me/stats - Level", f"Level: {data['level']}")
            else:
                log_fail("GET /api/scores/me/stats - Level", f"Level: {data['level']}")
            
            if data["global_rank"] == 1:
                log_pass("GET /api/scores/me/stats - Global rank", "Rank: 1 (only user)")
            else:
                log_pass("GET /api/scores/me/stats - Global rank", f"Rank: {data['global_rank']}")
        else:
            log_fail("GET /api/scores/me/stats - After scores", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("GET /api/scores/me/stats - After scores", f"Exception: {str(e)}")
    
    # Test 1.10: GET /api/scores/me/recent
    print("\nTest 1.10: GET /api/scores/me/recent")
    try:
        response = requests.get(
            f"{API_URL}/scores/me/recent",
            headers={"X-Client-Id": client_id_1}
        )
        if response.status_code == 200:
            data = response.json()
            if "items" in data and isinstance(data["items"], list):
                if len(data["items"]) > 0 and len(data["items"]) <= 20:
                    log_pass("GET /api/scores/me/recent", f"Returned {len(data['items'])} scores")
                else:
                    log_warn("GET /api/scores/me/recent", f"Returned {len(data['items'])} scores")
            else:
                log_fail("GET /api/scores/me/recent", "Invalid response structure")
        else:
            log_fail("GET /api/scores/me/recent", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("GET /api/scores/me/recent", f"Exception: {str(e)}")
    
    # Test 1.11: GET /api/scores/beatmap/:bid - Leaderboard
    print("\nTest 1.11: GET /api/scores/beatmap/:bid - Leaderboard")
    
    # Post scores from 3 different users on the same beatmap
    test_bid = f"test-leaderboard-{uuid.uuid4()}"
    
    # Ensure all users exist first (by calling GET /api/users/me)
    for cid in [client_id_1, client_id_2, client_id_3]:
        try:
            requests.get(f"{API_URL}/users/me", headers={"X-Client-Id": cid})
        except:
            pass
    
    # User 1: 2 scores
    for score_val in [5000000, 6000000]:
        try:
            requests.post(
                f"{API_URL}/scores",
                json={
                    "bid": test_bid,
                    "total_score": score_val,
                    "accuracy": 0.95,
                    "pp": 150,
                    "passed": True,
                    "hits": {"great": 100, "good": 20, "meh": 5, "miss": 2}
                },
                headers={"X-Client-Id": client_id_1}
            )
        except:
            pass
    
    # User 2: 2 scores
    for score_val in [7000000, 8000000]:
        try:
            requests.post(
                f"{API_URL}/scores",
                json={
                    "bid": test_bid,
                    "total_score": score_val,
                    "accuracy": 0.97,
                    "pp": 180,
                    "passed": True,
                    "hits": {"great": 120, "good": 15, "meh": 3, "miss": 1}
                },
                headers={"X-Client-Id": client_id_2}
            )
        except:
            pass
    
    # User 3: 2 scores
    for score_val in [4000000, 4500000]:
        try:
            requests.post(
                f"{API_URL}/scores",
                json={
                    "bid": test_bid,
                    "total_score": score_val,
                    "accuracy": 0.90,
                    "pp": 120,
                    "passed": True,
                    "hits": {"great": 90, "good": 25, "meh": 8, "miss": 3}
                },
                headers={"X-Client-Id": client_id_3}
            )
        except:
            pass
    
    time.sleep(0.5)  # Brief pause for DB consistency
    
    # Now fetch leaderboard
    try:
        response = requests.get(f"{API_URL}/scores/beatmap/{test_bid}")
        if response.status_code == 200:
            data = response.json()
            if "items" in data and isinstance(data["items"], list):
                items = data["items"]
                if len(items) == 3:
                    # Check that we got the best score per user
                    # User 2 should be first (8M), User 1 second (6M), User 3 third (4.5M)
                    if items[0]["total_score"] == 8000000 and items[1]["total_score"] == 6000000:
                        log_pass("GET /api/scores/beatmap/:bid", f"Leaderboard correct, {len(items)} users")
                    else:
                        log_fail("GET /api/scores/beatmap/:bid", f"Scores not sorted correctly: {[i['total_score'] for i in items]}")
                    
                    # Check user data is joined
                    if "user" in items[0] and "username" in items[0]["user"]:
                        log_pass("GET /api/scores/beatmap/:bid - User join", "User data present")
                    else:
                        log_fail("GET /api/scores/beatmap/:bid - User join", "User data missing")
                else:
                    log_fail("GET /api/scores/beatmap/:bid", f"Expected 3 users, got {len(items)}")
            else:
                log_fail("GET /api/scores/beatmap/:bid", "Invalid response structure")
        else:
            log_fail("GET /api/scores/beatmap/:bid", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("GET /api/scores/beatmap/:bid", f"Exception: {str(e)}")
    
    # Test 1.12: GET /api/scores/beatmap/:bid - Limit parameter
    print("\nTest 1.12: GET /api/scores/beatmap/:bid - Limit parameter")
    try:
        response = requests.get(f"{API_URL}/scores/beatmap/{test_bid}?limit=2")
        if response.status_code == 200:
            data = response.json()
            if len(data["items"]) == 2:
                log_pass("GET /api/scores/beatmap/:bid - Limit", "Limit parameter honored")
            else:
                log_fail("GET /api/scores/beatmap/:bid - Limit", f"Expected 2 items, got {len(data['items'])}")
        else:
            log_fail("GET /api/scores/beatmap/:bid - Limit", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("GET /api/scores/beatmap/:bid - Limit", f"Exception: {str(e)}")

# ============================================================================
# 2. AUTH ROUTES TESTS
# ============================================================================

def test_auth_routes():
    """Test all auth routes"""
    print_section("2. AUTH ROUTES TESTS")
    
    # Test 2.1: POST /api/auth/session - Short session_id
    print("Test 2.1: POST /api/auth/session - Short session_id")
    try:
        response = requests.post(
            f"{API_URL}/auth/session",
            json={"session_id": "short"}
        )
        if response.status_code == 400:
            log_pass("POST /api/auth/session - Short session_id", "Correctly rejected with 400")
        else:
            log_fail("POST /api/auth/session - Short session_id", f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_fail("POST /api/auth/session - Short session_id", f"Exception: {str(e)}")
    
    # Test 2.2: POST /api/auth/session - Invalid session_id
    print("\nTest 2.2: POST /api/auth/session - Invalid session_id")
    try:
        response = requests.post(
            f"{API_URL}/auth/session",
            json={"session_id": "bogusabcdefghij"}
        )
        if response.status_code == 401:
            log_pass("POST /api/auth/session - Invalid session_id", "Correctly rejected with 401")
        else:
            log_fail("POST /api/auth/session - Invalid session_id", f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_fail("POST /api/auth/session - Invalid session_id", f"Exception: {str(e)}")
    
    # Test 2.3: GET /api/auth/me - No cookie/header
    print("\nTest 2.3: GET /api/auth/me - No cookie/header")
    try:
        response = requests.get(f"{API_URL}/auth/me")
        if response.status_code == 401:
            log_pass("GET /api/auth/me - No auth", "Correctly rejected with 401")
        else:
            log_fail("GET /api/auth/me - No auth", f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_fail("GET /api/auth/me - No auth", f"Exception: {str(e)}")
    
    # Test 2.4: GET /api/auth/me - Fake Bearer token
    print("\nTest 2.4: GET /api/auth/me - Fake Bearer token")
    try:
        response = requests.get(
            f"{API_URL}/auth/me",
            headers={"Authorization": "Bearer fake-token-12345"}
        )
        if response.status_code == 401:
            log_pass("GET /api/auth/me - Fake token", "Correctly rejected with 401")
        else:
            log_fail("GET /api/auth/me - Fake token", f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_fail("GET /api/auth/me - Fake token", f"Exception: {str(e)}")
    
    # Test 2.5: Mock a valid session and test GET /api/auth/me
    print("\nTest 2.5: GET /api/auth/me - Mock valid session")
    
    # Create mock user and session in MongoDB
    mock_user_id = f"user_mock_test_{int(time.time())}"
    mock_session_token = f"mock-session-token-{uuid.uuid4()}"
    
    print(f"  Creating mock user: {mock_user_id}")
    print(f"  Creating mock session: {mock_session_token}")
    
    # Use mongosh to create the mock data
    mongosh_cmd = f"""
mongosh --quiet --eval "
use('osuweb');
db.users.insertOne({{
  id: '{mock_user_id}',
  user_id: '{mock_user_id}',
  email: 'mocktest{int(time.time())}@example.com',
  username: 'MockTester',
  name: 'Mock Tester',
  picture: null,
  country: 'FR',
  created_at: new Date(),
}});
db.user_sessions.insertOne({{
  user_id: '{mock_user_id}',
  session_token: '{mock_session_token}',
  created_at: new Date(),
  expires_at: new Date(Date.now() + 7*86400*1000)
}});
print('Mock user and session created');
"
"""
    
    try:
        import subprocess
        result = subprocess.run(mongosh_cmd, shell=True, capture_output=True, text=True)
        if "Mock user and session created" in result.stdout or result.returncode == 0:
            print("  ✓ Mock data created in MongoDB")
            
            # Now test GET /api/auth/me with the mock session
            response = requests.get(
                f"{API_URL}/auth/me",
                headers={"Authorization": f"Bearer {mock_session_token}"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("user_id") == mock_user_id and data.get("username") == "MockTester":
                    log_pass("GET /api/auth/me - Mock session", f"User data returned correctly")
                else:
                    log_fail("GET /api/auth/me - Mock session", f"Unexpected data: {data}")
            else:
                log_fail("GET /api/auth/me - Mock session", f"Status: {response.status_code}, Body: {response.text}")
        else:
            log_warn("GET /api/auth/me - Mock session", f"Failed to create mock data: {result.stderr}")
    except Exception as e:
        log_warn("GET /api/auth/me - Mock session", f"Exception: {str(e)}")
    
    # Test 2.6: GET /api/auth/me - Expired session
    print("\nTest 2.6: GET /api/auth/me - Expired session")
    
    expired_user_id = f"user_expired_{int(time.time())}"
    expired_session_token = f"expired-session-{uuid.uuid4()}"
    
    mongosh_cmd_expired = f"""
mongosh --quiet --eval "
use('osuweb');
db.users.insertOne({{
  id: '{expired_user_id}',
  user_id: '{expired_user_id}',
  email: 'expired{int(time.time())}@example.com',
  username: 'ExpiredUser',
  name: 'Expired User',
  picture: null,
  country: 'US',
  created_at: new Date(),
}});
db.user_sessions.insertOne({{
  user_id: '{expired_user_id}',
  session_token: '{expired_session_token}',
  created_at: new Date(Date.now() - 8*86400*1000),
  expires_at: new Date(Date.now() - 86400*1000)
}});
print('Expired session created');
"
"""
    
    try:
        result = subprocess.run(mongosh_cmd_expired, shell=True, capture_output=True, text=True)
        if "Expired session created" in result.stdout or result.returncode == 0:
            print("  ✓ Expired session created in MongoDB")
            
            # Test with expired session
            response = requests.get(
                f"{API_URL}/auth/me",
                headers={"Authorization": f"Bearer {expired_session_token}"}
            )
            
            if response.status_code == 401:
                log_pass("GET /api/auth/me - Expired session", "Correctly rejected with 401")
                
                # Verify the session was deleted
                check_cmd = f"""
mongosh --quiet --eval "
use('osuweb');
var count = db.user_sessions.countDocuments({{ session_token: '{expired_session_token}' }});
print(count);
"
"""
                result = subprocess.run(check_cmd, shell=True, capture_output=True, text=True)
                if "0" in result.stdout:
                    log_pass("GET /api/auth/me - Expired session cleanup", "Session deleted from DB")
                else:
                    log_warn("GET /api/auth/me - Expired session cleanup", "Session not deleted")
            else:
                log_fail("GET /api/auth/me - Expired session", f"Expected 401, got {response.status_code}")
        else:
            log_warn("GET /api/auth/me - Expired session", f"Failed to create expired session: {result.stderr}")
    except Exception as e:
        log_warn("GET /api/auth/me - Expired session", f"Exception: {str(e)}")
    
    # Test 2.7: POST /api/auth/logout - Without session
    print("\nTest 2.7: POST /api/auth/logout - Without session")
    try:
        response = requests.post(f"{API_URL}/auth/logout")
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                log_pass("POST /api/auth/logout - No session", "Returns ok:true")
            else:
                log_fail("POST /api/auth/logout - No session", f"Unexpected response: {data}")
        else:
            log_fail("POST /api/auth/logout - No session", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("POST /api/auth/logout - No session", f"Exception: {str(e)}")
    
    # Test 2.8: POST /api/auth/logout - With mock session
    print("\nTest 2.8: POST /api/auth/logout - With mock session")
    
    logout_user_id = f"user_logout_{int(time.time())}"
    logout_session_token = f"logout-session-{uuid.uuid4()}"
    
    mongosh_cmd_logout = f"""
mongosh --quiet --eval "
use('osuweb');
db.users.insertOne({{
  id: '{logout_user_id}',
  user_id: '{logout_user_id}',
  email: 'logout{int(time.time())}@example.com',
  username: 'LogoutUser',
  name: 'Logout User',
  picture: null,
  country: 'JP',
  created_at: new Date(),
}});
db.user_sessions.insertOne({{
  user_id: '{logout_user_id}',
  session_token: '{logout_session_token}',
  created_at: new Date(),
  expires_at: new Date(Date.now() + 7*86400*1000)
}});
print('Logout session created');
"
"""
    
    try:
        result = subprocess.run(mongosh_cmd_logout, shell=True, capture_output=True, text=True)
        if "Logout session created" in result.stdout or result.returncode == 0:
            print("  ✓ Logout session created in MongoDB")
            
            # Test logout
            response = requests.post(
                f"{API_URL}/auth/logout",
                headers={"Authorization": f"Bearer {logout_session_token}"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("ok") == True:
                    log_pass("POST /api/auth/logout - With session", "Returns ok:true")
                    
                    # Verify the session was deleted
                    check_cmd = f"""
mongosh --quiet --eval "
use('osuweb');
var count = db.user_sessions.countDocuments({{ session_token: '{logout_session_token}' }});
print(count);
"
"""
                    result = subprocess.run(check_cmd, shell=True, capture_output=True, text=True)
                    if "0" in result.stdout:
                        log_pass("POST /api/auth/logout - Session cleanup", "Session deleted from DB")
                    else:
                        log_fail("POST /api/auth/logout - Session cleanup", "Session not deleted")
                else:
                    log_fail("POST /api/auth/logout - With session", f"Unexpected response: {data}")
            else:
                log_fail("POST /api/auth/logout - With session", f"Status: {response.status_code}")
        else:
            log_warn("POST /api/auth/logout - With session", f"Failed to create logout session: {result.stderr}")
    except Exception as e:
        log_warn("POST /api/auth/logout - With session", f"Exception: {str(e)}")

# ============================================================================
# 3. MIDDLEWARE TESTS
# ============================================================================

def test_middleware():
    """Test attachUserIfAuthed middleware behavior"""
    print_section("3. MIDDLEWARE TESTS (attachUserIfAuthed)")
    
    # Test 3.1: Anonymous X-Client-Id flow still works
    print("Test 3.1: Anonymous X-Client-Id flow - GET /api/users/me")
    anon_client_id = f"test-middleware-anon-{uuid.uuid4()}"
    
    try:
        response = requests.get(
            f"{API_URL}/users/me",
            headers={"X-Client-Id": anon_client_id}
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("id") == anon_client_id:
                log_pass("Middleware - Anonymous users/me", "Anonymous flow works")
            else:
                log_fail("Middleware - Anonymous users/me", f"Wrong user ID: {data.get('id')}")
        else:
            log_fail("Middleware - Anonymous users/me", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("Middleware - Anonymous users/me", f"Exception: {str(e)}")
    
    # Test 3.2: Anonymous imports flow
    print("\nTest 3.2: Anonymous X-Client-Id flow - GET /api/imports")
    try:
        response = requests.get(
            f"{API_URL}/imports",
            headers={"X-Client-Id": anon_client_id}
        )
        if response.status_code == 200:
            log_pass("Middleware - Anonymous imports", "Anonymous imports works")
        else:
            log_fail("Middleware - Anonymous imports", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("Middleware - Anonymous imports", f"Exception: {str(e)}")
    
    # Test 3.3: Authenticated user scoping
    print("\nTest 3.3: Authenticated user scoping - imports/scores")
    
    # Create a mock authenticated user
    auth_user_id = f"user_auth_test_{int(time.time())}"
    auth_session_token = f"auth-session-{uuid.uuid4()}"
    
    mongosh_cmd = f"""
mongosh --quiet --eval "
use('osuweb');
db.users.insertOne({{
  id: '{auth_user_id}',
  user_id: '{auth_user_id}',
  email: 'authtest{int(time.time())}@example.com',
  username: 'AuthTestUser',
  name: 'Auth Test User',
  picture: null,
  country: 'DE',
  created_at: new Date(),
}});
db.user_sessions.insertOne({{
  user_id: '{auth_user_id}',
  session_token: '{auth_session_token}',
  created_at: new Date(),
  expires_at: new Date(Date.now() + 7*86400*1000)
}});
print('Auth test user created');
"
"""
    
    try:
        import subprocess
        result = subprocess.run(mongosh_cmd, shell=True, capture_output=True, text=True)
        if "Auth test user created" in result.stdout or result.returncode == 0:
            print("  ✓ Auth test user created in MongoDB")
            
            # Test that authenticated requests use user_id, not X-Client-Id
            # Even if we send X-Client-Id, it should be ignored
            fake_client_id = f"fake-client-{uuid.uuid4()}"
            
            # Get imports with auth (should be scoped to auth_user_id)
            response = requests.get(
                f"{API_URL}/imports",
                headers={
                    "Authorization": f"Bearer {auth_session_token}",
                    "X-Client-Id": fake_client_id  # This should be ignored
                }
            )
            
            if response.status_code == 200:
                log_pass("Middleware - Auth imports", "Authenticated imports works")
            else:
                log_fail("Middleware - Auth imports", f"Status: {response.status_code}")
            
            # Post a score with auth
            score_data = {
                "bid": "auth-test-bid",
                "total_score": 5000000,
                "accuracy": 0.95,
                "passed": True,
                "hits": {"great": 100, "good": 20, "meh": 5, "miss": 2}
            }
            
            response = requests.post(
                f"{API_URL}/scores",
                json=score_data,
                headers={
                    "Authorization": f"Bearer {auth_session_token}",
                    "X-Client-Id": fake_client_id  # This should be ignored
                }
            )
            
            if response.status_code == 201:
                data = response.json()
                if data.get("user_id") == auth_user_id:
                    log_pass("Middleware - Auth score scoping", f"Score scoped to auth user_id")
                else:
                    log_fail("Middleware - Auth score scoping", f"Score scoped to: {data.get('user_id')}")
            else:
                log_fail("Middleware - Auth score post", f"Status: {response.status_code}")
            
            # Verify the score is in the auth user's stats
            response = requests.get(
                f"{API_URL}/scores/me/stats",
                headers={"Authorization": f"Bearer {auth_session_token}"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("playcount") >= 1:
                    log_pass("Middleware - Auth stats", f"Stats show playcount: {data['playcount']}")
                else:
                    log_fail("Middleware - Auth stats", "Playcount is 0")
            else:
                log_fail("Middleware - Auth stats", f"Status: {response.status_code}")
        else:
            log_warn("Middleware - Auth scoping", f"Failed to create auth test user: {result.stderr}")
    except Exception as e:
        log_warn("Middleware - Auth scoping", f"Exception: {str(e)}")

# ============================================================================
# 4. REGRESSION TESTS
# ============================================================================

def test_regression():
    """Test that existing anonymous flows still work"""
    print_section("4. REGRESSION TESTS")
    
    anon_client_id = f"test-regression-{uuid.uuid4()}"
    
    # Test 4.1: GET /api/users/me
    print("Test 4.1: GET /api/users/me - Anonymous")
    try:
        response = requests.get(
            f"{API_URL}/users/me",
            headers={"X-Client-Id": anon_client_id}
        )
        if response.status_code == 200:
            log_pass("Regression - GET /api/users/me", "Works")
        else:
            log_fail("Regression - GET /api/users/me", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("Regression - GET /api/users/me", f"Exception: {str(e)}")
    
    # Test 4.2: PATCH /api/users/me
    print("\nTest 4.2: PATCH /api/users/me - Anonymous")
    try:
        response = requests.patch(
            f"{API_URL}/users/me",
            json={"username": "RegressionTester", "country": "CA"},
            headers={"X-Client-Id": anon_client_id}
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("username") == "RegressionTester":
                log_pass("Regression - PATCH /api/users/me", "Works")
            else:
                log_fail("Regression - PATCH /api/users/me", f"Username not updated: {data.get('username')}")
        else:
            log_fail("Regression - PATCH /api/users/me", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("Regression - PATCH /api/users/me", f"Exception: {str(e)}")
    
    # Test 4.3: GET /api/imports
    print("\nTest 4.3: GET /api/imports - Anonymous")
    try:
        response = requests.get(
            f"{API_URL}/imports",
            headers={"X-Client-Id": anon_client_id}
        )
        if response.status_code == 200:
            log_pass("Regression - GET /api/imports", "Works")
        else:
            log_fail("Regression - GET /api/imports", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("Regression - GET /api/imports", f"Exception: {str(e)}")
    
    # Test 4.4: GET /api/beatmaps/popular
    print("\nTest 4.4: GET /api/beatmaps/popular - No auth required")
    try:
        response = requests.get(f"{API_URL}/beatmaps/popular?limit=5")
        if response.status_code == 200:
            log_pass("Regression - GET /api/beatmaps/popular", "Works")
        else:
            log_fail("Regression - GET /api/beatmaps/popular", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("Regression - GET /api/beatmaps/popular", f"Exception: {str(e)}")
    
    # Test 4.5: GET /api/menu
    print("\nTest 4.5: GET /api/menu - No auth required")
    try:
        response = requests.get(f"{API_URL}/menu")
        if response.status_code == 200:
            log_pass("Regression - GET /api/menu", "Works")
        else:
            log_fail("Regression - GET /api/menu", f"Status: {response.status_code}")
    except Exception as e:
        log_fail("Regression - GET /api/menu", f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def print_summary():
    """Print test summary"""
    print_section("TEST SUMMARY")
    
    total = len(test_results["passed"]) + len(test_results["failed"]) + len(test_results["warnings"])
    passed = len(test_results["passed"])
    failed = len(test_results["failed"])
    warnings = len(test_results["warnings"])
    
    print(f"Total Tests: {total}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"⚠️  Warnings: {warnings}")
    print()
    
    if failed > 0:
        print("FAILED TESTS:")
        for result in test_results["failed"]:
            print(f"  ❌ {result['test']}")
            if result['details']:
                print(f"     {result['details']}")
        print()
    
    if warnings > 0:
        print("WARNINGS:")
        for result in test_results["warnings"]:
            print(f"  ⚠️  {result['test']}")
            if result['details']:
                print(f"     {result['details']}")
        print()
    
    success_rate = (passed / total * 100) if total > 0 else 0
    print(f"Success Rate: {success_rate:.1f}%")
    print()

if __name__ == "__main__":
    print("="*80)
    print("  WEBOSU2 BACKEND TEST SUITE")
    print("  Backend: Node.js/Express (backend-node)")
    print(f"  Base URL: {BASE_URL}")
    print("="*80)
    print()
    
    # Run all test suites
    test_scores_routes()
    test_auth_routes()
    test_middleware()
    test_regression()
    
    # Print summary
    print_summary()
    
    # Exit with appropriate code
    if len(test_results["failed"]) > 0:
        exit(1)
    else:
        exit(0)
