# VI Backend QA Test Document

**Version:** 1.0
**API Under Test:** VI API Server (FastAPI)
**Total Tests:** 48
**Generated:** 2026-02-28

---

## Prerequisites

### Environment Variables

```bash
export API_URL="${VI_TEST_API_URL:-http://localhost:8000}"
export TEST_EMAIL="e2e_test_${$}_$(date +%s)@vitest.local"
export TEST_PASSWORD="TestPass_${$}_$(date +%s)"
export TEST_DISPLAY_NAME="E2E Bot $$"
export DEVICE_ID="e2e-device-${$}-$(date +%s)"

# Populated during execution (do not set manually):
export TOKEN=""
export VI_USER_ID=""
export SESSION_ID=""
export TASK_ID=""
export ANON_VI_USER_ID=""
export ANON_SESSION_ID=""
export MEMORY_FILENAME=""
```

### Timing Helper

```bash
timed_curl() {
  local start=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000000000))")
  local response=$(curl -s -w "\n%{http_code}" "$@")
  local end=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000000000))")
  local http_code=$(echo "$response" | tail -1)
  local body=$(echo "$response" | sed '$d')
  local duration_ms=$(( (end - start) / 1000000 ))
  echo "$body"
  echo "---HTTP:${http_code}---MS:${duration_ms}---"
}
```

### Assertion Helpers

```bash
assert_status() {
  local actual="$1" expected="$2" test_id="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS [$test_id] HTTP $actual"
  else
    echo "FAIL [$test_id] Expected HTTP $expected, got $actual"
  fi
}

assert_json_field() {
  local body="$1" field="$2" test_id="$3"
  if echo "$body" | jq -e ".$field" > /dev/null 2>&1; then
    echo "PASS [$test_id] Field .$field exists"
  else
    echo "FAIL [$test_id] Field .$field missing"
  fi
}

assert_json_value() {
  local body="$1" field="$2" expected="$3" test_id="$4"
  local actual=$(echo "$body" | jq -r ".$field")
  if [ "$actual" = "$expected" ]; then
    echo "PASS [$test_id] .$field == $expected"
  else
    echo "FAIL [$test_id] .$field expected '$expected', got '$actual'"
  fi
}

record_perf() {
  local key="$1" ms="$2"
  echo "{\"$key\": $ms}" >> perf_results.jsonl
}
```

### Test Isolation

Each run uses unique `TEST_EMAIL`, `TEST_PASSWORD`, and `DEVICE_ID` derived from PID and epoch timestamp. Tests within a suite execute sequentially (later tests depend on IDs captured from earlier ones). Suites are independent except where noted in `Deps`.

### Required Tools

```bash
command -v curl >/dev/null || { echo "FATAL: curl required"; exit 1; }
command -v jq   >/dev/null || { echo "FATAL: jq required";   exit 1; }
```

---

## Suite Overview (All Tests)

| Suite | ID | Name | Method | Path | Auth | Severity |
|---|---|---|---|---|---|---|
| HEALTH | H-1 | Health check | GET | /health | none | CRITICAL |
| HEALTH | H-2 | Swagger docs | GET | /docs | none | LOW |
| AUTH | A-1 | Signup | POST | /api/auth/signup | none | CRITICAL |
| AUTH | A-2 | Signup duplicate | POST | /api/auth/signup | none | HIGH |
| AUTH | A-3 | Login | POST | /api/auth/login | none | CRITICAL |
| AUTH | A-4 | Login wrong password | POST | /api/auth/login | none | HIGH |
| AUTH | A-5 | Login nonexistent user | POST | /api/auth/login | none | HIGH |
| AUTH | A-6 | Me valid token | GET | /api/auth/me | JWT | CRITICAL |
| AUTH | A-7 | Me no token | GET | /api/auth/me | none | MED |
| AUTH | A-8 | Me invalid token | GET | /api/auth/me | bad JWT | MED |
| LIVEKIT | L-1 | Anonymous token | POST | /api/livekit/anonymous | none | CRITICAL |
| LIVEKIT | L-2 | Anonymous same device | POST | /api/livekit/anonymous | none | HIGH |
| LIVEKIT | L-3 | Authenticated token | POST | /api/livekit/token | JWT | CRITICAL |
| LIVEKIT | L-4 | JWT format validation | - | - | - | MED |
| SESSION | S-1 | Create session | POST | /api/internal/sessions | none | HIGH |
| SESSION | S-2 | Dispatch session | POST | /api/internal/sessions/{id}/dispatch | none | HIGH |
| SESSION | S-3 | Complete session | POST | /api/internal/sessions/{id}/complete | none | HIGH |
| SESSION | S-4 | Fail session | POST | /api/internal/sessions/{id}/fail | none | HIGH |
| SESSION | S-5 | Get session by ID | GET | /api/internal/sessions/{id} | none | HIGH |
| SESSION | S-6 | List user sessions | GET | /api/internal/sessions/by-user/{vi_user_id} | none | HIGH |
| SESSION | S-7 | Patch session | PATCH | /api/internal/sessions/{id} | none | HIGH |
| SESSION | S-8 | End session | PATCH | /api/internal/sessions/{id}/end | none | HIGH |
| SESSION | S-9 | User sessions (JWT) | GET | /api/users/sessions | JWT | HIGH |
| SESSION | S-10 | State machine guard | POST | /api/internal/sessions/{id}/complete | none | MED |
| SESSION | S-11 | Sessions by device | GET | /api/users/sessions/by-device | none | HIGH |
| TASK | T-1 | Create task | POST | /api/internal/tasks | none | HIGH |
| TASK | T-2 | Update task | PATCH | /api/internal/tasks/{id} | none | HIGH |
| TASK | T-3 | List tasks (JWT) | GET | /api/users/tasks | JWT | HIGH |
| TASK | T-4 | List tasks by device | GET | /api/users/tasks/by-device | none | HIGH |
| TASK | T-5 | Delete task (JWT) | DELETE | /api/users/tasks/{id} | JWT | HIGH |
| TASK | T-6 | Delete task by device | DELETE | /api/users/tasks/by-device/{id} | none | HIGH |
| MEMORY | M-1 | Append memory (internal) | POST | /api/internal/memories | none | HIGH |
| MEMORY | M-2 | Upsert memory (internal) | PUT | /api/internal/memories/{filename} | none | HIGH |
| MEMORY | M-3 | Batch memory update | POST | /api/internal/memories/batch | none | HIGH |
| MEMORY | M-4 | Get memory context | GET | /api/internal/memories/context/{vi_user_id} | none | HIGH |
| MEMORY | M-5 | List memory (JWT) | GET | /api/users/memory | JWT | HIGH |
| MEMORY | M-6 | Get memory file (JWT) | GET | /api/users/memory/{filename} | JWT | HIGH |
| MEMORY | M-7 | Upsert memory (JWT) | PUT | /api/users/memory/{filename} | JWT | HIGH |
| MEMORY | M-8 | Delete memory (JWT) | DELETE | /api/users/memory/{filename} | JWT | HIGH |
| MEMORY | M-9 | List memory by device | GET | /api/users/memory/by-device | none | HIGH |
| MEMORY | M-10 | Upsert memory by device | PUT | /api/users/memory/by-device/{filename} | none | HIGH |
| MEMORY | M-11 | Delete memory by device | DELETE | /api/users/memory/by-device/{filename} | none | HIGH |
| UPLOAD | U-1 | Get presigned URL | GET | /api/upload/presign | none | HIGH |
| UPLOAD | U-2 | Upload flow (presign + PUT) | GET+PUT | /api/upload/presign + GCS | none | MED |
| EVENTS | E-1 | SSE stream (JWT) | GET | /api/users/events | JWT | HIGH |
| EVENTS | E-2 | SSE stream (device) | GET | /api/users/events?vi_user_id=X | none | HIGH |
| GATEWAY | G-1 | Gateway join proxy | POST | /api/internal/gateway/join | none | MED |
| GATEWAY | G-2 | GCS presign-get | POST | /api/internal/storage/presign-get | none | MED |

---

## Suite 1: HEALTH (2 tests)

| ID | Name | Severity | Perf Key |
|---|---|---|---|
| H-1 | Health check | CRITICAL | health_check |
| H-2 | Swagger docs | LOW | swagger_load |

---

### H-1: Health Check
> GET /health | Auth: none | Severity: CRITICAL | Deps: none | Perf: health_check

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/health")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.status == "ok"'` --> PASS_BODY_OK
- `[ "$MS" -lt 500 ]` --> PASS_LATENCY

**On Fail --> Diagnose:**
- HTTP 000 / connection refused --> API server not running | check: `docker ps | grep vi-api`
- HTTP 502 --> Reverse proxy up but API down | check: `docker logs vi-api 2>&1 | tail -20`
- timeout --> Network/DNS issue | check: `curl -v "$API_URL/health" 2>&1`

**Perf:** health_check (baseline: 50ms)

---

### H-2: Swagger Docs
> GET /docs | Auth: none | Severity: LOW | Deps: none | Perf: swagger_load

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/docs")
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | grep -q "swagger"` --> PASS_SWAGGER_HTML

**On Fail --> Diagnose:**
- HTTP 404 --> Docs endpoint disabled in FastAPI config | check: review `FastAPI(docs_url=...)` in main.py
- HTTP 500 --> Static asset issue | check: `docker logs vi-api 2>&1 | tail -10`

**Perf:** swagger_load (baseline: 200ms)

---

## Suite 2: AUTH (8 tests)

| ID | Name | Severity | Perf Key |
|---|---|---|---|
| A-1 | Signup | CRITICAL | auth_signup |
| A-2 | Signup duplicate | HIGH | - |
| A-3 | Login | CRITICAL | auth_login |
| A-4 | Login wrong password | HIGH | - |
| A-5 | Login nonexistent user | HIGH | - |
| A-6 | Me valid token | CRITICAL | auth_me |
| A-7 | Me no token | MED | - |
| A-8 | Me invalid token | MED | - |

---

### A-1: Signup
> POST /api/auth/signup | Auth: none | Severity: CRITICAL | Deps: none | Perf: auth_signup

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"display_name\":\"$TEST_DISPLAY_NAME\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)

# Capture for subsequent tests
export TOKEN=$(echo "$BODY" | jq -r '.token')
export VI_USER_ID=$(echo "$BODY" | jq -r '.vi_user_id')
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.token'` --> PASS_HAS_TOKEN
- `echo "$BODY" | jq -e '.vi_user_id | startswith("vi-")'` --> PASS_VI_USER_ID_PREFIX
- `echo "$BODY" | jq -e '.email'` --> PASS_HAS_EMAIL
- `echo "$BODY" | jq -e '.user_id'` --> PASS_HAS_USER_ID
- `echo "$BODY" | jq -e '.display_name'` --> PASS_HAS_DISPLAY_NAME

**On Fail --> Diagnose:**
- HTTP 500 + "connection" --> DB down | check: `docker logs vi-db 2>&1 | tail -20`
- HTTP 422 --> Pydantic validation failed (email format, password length) | check: request payload format
- HTTP 500 + "duplicate key" --> Unique constraint on email | check: previous test left data
- timeout --> DB connection pool exhausted | check: `docker logs vi-api 2>&1 | grep "pool"`

**Perf:** auth_signup (baseline: 300ms)

---

### A-2: Signup Duplicate
> POST /api/auth/signup | Auth: none | Severity: HIGH | Deps: A-1 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"display_name\":\"$TEST_DISPLAY_NAME\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "409" ]` --> PASS_STATUS_409
- `echo "$BODY" | jq -e '.detail | test("already registered")'` --> PASS_CONFLICT_MESSAGE

**On Fail --> Diagnose:**
- HTTP 200 --> Duplicate check missing in signup handler | check: review `select(User).where(User.email == ...)` in auth.py
- HTTP 500 --> DB unique constraint fired instead of app check | check: `docker logs vi-api 2>&1 | tail -10`

---

### A-3: Login
> POST /api/auth/login | Auth: none | Severity: CRITICAL | Deps: A-1 | Perf: auth_login

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)

# Refresh token from login
export TOKEN=$(echo "$BODY" | jq -r '.token')
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.token'` --> PASS_HAS_TOKEN
- `echo "$BODY" | jq -e '.vi_user_id'` --> PASS_HAS_VI_USER_ID
- `echo "$BODY" | jq -e '.email'` --> PASS_HAS_EMAIL
- `[ "$(echo "$BODY" | jq -r '.email')" = "$TEST_EMAIL" ]` --> PASS_EMAIL_MATCH

**On Fail --> Diagnose:**
- HTTP 401 --> Password hash mismatch or bcrypt version issue | check: `python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('test'))"`
- HTTP 422 --> Missing email/password fields | check: request body format
- HTTP 500 --> DB connection error | check: `docker logs vi-api 2>&1 | tail -20`

**Perf:** auth_login (baseline: 400ms)

---

### A-4: Login Wrong Password
> POST /api/auth/login | Auth: none | Severity: HIGH | Deps: A-1 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"WrongPassword999\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "401" ]` --> PASS_STATUS_401
- `echo "$BODY" | jq -e '.detail | test("Invalid credentials")'` --> PASS_GENERIC_ERROR

**On Fail --> Diagnose:**
- HTTP 200 --> Password verification bypassed | check: review `verify_password` in auth.py
- HTTP 500 --> bcrypt error | check: `pip show passlib bcrypt`

---

### A-5: Login Nonexistent User
> POST /api/auth/login | Auth: none | Severity: HIGH | Deps: none | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"nonexistent_$(date +%s)@vitest.local\",\"password\":\"AnyPassword1\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "401" ]` --> PASS_STATUS_401
- `echo "$BODY" | jq -e '.detail | test("Invalid credentials")'` --> PASS_GENERIC_ERROR_NO_LEAK

**On Fail --> Diagnose:**
- HTTP 200 --> Auth bypass for unknown users | check: review login handler flow
- different error message than A-4 --> Timing attack vector (message differs for non-existent vs wrong-password) | check: compare A-4 and A-5 error strings

---

### A-6: Me Valid Token
> GET /api/auth/me | Auth: JWT | Severity: CRITICAL | Deps: A-3 | Perf: auth_me

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.user_id'` --> PASS_HAS_USER_ID
- `echo "$BODY" | jq -e '.vi_user_id'` --> PASS_HAS_VI_USER_ID
- `echo "$BODY" | jq -e '.email'` --> PASS_HAS_EMAIL
- `echo "$BODY" | jq -e '.display_name'` --> PASS_HAS_DISPLAY_NAME
- `echo "$BODY" | jq -e '.created_at'` --> PASS_HAS_CREATED_AT

**On Fail --> Diagnose:**
- HTTP 401 + "Invalid token" --> JWT_SECRET mismatch between signup and me endpoint | check: `echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .`
- HTTP 401 + "Not authenticated" --> Bearer header format wrong | check: ensure "Bearer " prefix present
- HTTP 401 + "User not found" --> Token valid but user deleted | check: user exists in DB

**Perf:** auth_me (baseline: 100ms)

---

### A-7: Me No Token
> GET /api/auth/me | Auth: none | Severity: MED | Deps: none | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/auth/me")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "401" ]` --> PASS_STATUS_401
- `echo "$BODY" | jq -e '.detail'` --> PASS_HAS_ERROR_DETAIL

**On Fail --> Diagnose:**
- HTTP 200 --> Auth dependency not enforced on /me route | check: `Depends(get_current_user)` in auth.py
- HTTP 403 --> HTTPBearer auto_error mismatch | check: `HTTPBearer(auto_error=...)` setting in deps.py

---

### A-8: Me Invalid Token
> GET /api/auth/me | Auth: bad JWT | Severity: MED | Deps: none | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/auth/me" \
  -H "Authorization: Bearer invalid.token.string")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "401" ]` --> PASS_STATUS_401
- `echo "$BODY" | jq -e '.detail | test("[Ii]nvalid")'` --> PASS_INVALID_TOKEN_MSG

**On Fail --> Diagnose:**
- HTTP 200 --> JWT decode not enforced | check: `decode_access_token` in token_service.py
- HTTP 500 --> Unhandled PyJWTError | check: exception handling in `get_current_user`

---

## Suite 3: LIVEKIT (4 tests)

| ID | Name | Severity | Perf Key |
|---|---|---|---|
| L-1 | Anonymous token | CRITICAL | livekit_anon |
| L-2 | Anonymous same device | HIGH | - |
| L-3 | Authenticated token | CRITICAL | livekit_auth |
| L-4 | JWT format validation | MED | - |

---

### L-1: Anonymous Token
> POST /api/livekit/anonymous | Auth: none | Severity: CRITICAL | Deps: none | Perf: livekit_anon

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/livekit/anonymous" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)

# Capture for subsequent tests
export ANON_VI_USER_ID=$(echo "$BODY" | jq -r '.vi_user_id')
export ANON_SESSION_ID=$(echo "$BODY" | jq -r '.session_id')
export ANON_TOKEN_LK=$(echo "$BODY" | jq -r '.token')
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.token'` --> PASS_HAS_TOKEN
- `echo "$BODY" | jq -e '.room_name'` --> PASS_HAS_ROOM_NAME
- `echo "$BODY" | jq -e '.livekit_url'` --> PASS_HAS_LIVEKIT_URL
- `echo "$BODY" | jq -e '.vi_user_id'` --> PASS_HAS_VI_USER_ID
- `echo "$BODY" | jq -e '.session_id'` --> PASS_HAS_SESSION_ID

**On Fail --> Diagnose:**
- HTTP 500 + "LIVEKIT" --> Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET | check: `env | grep LIVEKIT`
- HTTP 500 + "connection" --> DB down | check: `docker logs vi-db 2>&1 | tail -20`
- HTTP 422 --> device_id format issue | check: request body format
- HTTP 429 --> Rate limit hit (10/min) | check: wait and retry

**Perf:** livekit_anon (baseline: 500ms)

---

### L-2: Anonymous Same Device
> POST /api/livekit/anonymous | Auth: none | Severity: HIGH | Deps: L-1 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/livekit/anonymous" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
SECOND_VI_USER_ID=$(echo "$BODY" | jq -r '.vi_user_id')
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `[ "$SECOND_VI_USER_ID" = "$ANON_VI_USER_ID" ]` --> PASS_SAME_VI_USER_ID

**On Fail --> Diagnose:**
- Different vi_user_id --> Device-to-user mapping not persisting | check: review `select(User).where(User.vi_user_id == vi_user_id)` in livekit.py
- HTTP 500 + "duplicate" --> Email uniqueness conflict on anonymous user creation | check: `docker logs vi-api 2>&1 | tail -10`

---

### L-3: Authenticated Token
> POST /api/livekit/token | Auth: JWT | Severity: CRITICAL | Deps: A-3 | Perf: livekit_auth

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/livekit/token" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.token'` --> PASS_HAS_TOKEN
- `echo "$BODY" | jq -e '.room_name | startswith("vi-room-")'` --> PASS_ROOM_NAME_FORMAT
- `echo "$BODY" | jq -e '.livekit_url'` --> PASS_HAS_LIVEKIT_URL

**On Fail --> Diagnose:**
- HTTP 401 --> Token expired or invalid | check: `echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .exp`
- HTTP 500 + "LIVEKIT" --> LiveKit SDK error (missing keys) | check: `env | grep LIVEKIT`
- HTTP 500 + "connection" --> DB error creating session record | check: `docker logs vi-api 2>&1 | tail -10`

**Perf:** livekit_auth (baseline: 400ms)

---

### L-4: JWT Format Validation
> - | Auth: - | Severity: MED | Deps: L-1 | Perf: -

**Execute:**
```bash
# Validate the LiveKit JWT from L-1 has proper 3-part structure
LK_TOKEN="$ANON_TOKEN_LK"
PARTS=$(echo "$LK_TOKEN" | tr '.' '\n' | wc -l)
```

**Assert:**
- `[ "$PARTS" -eq 3 ]` --> PASS_JWT_THREE_PARTS
- `echo "$LK_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -e '.video' > /dev/null 2>&1` --> PASS_HAS_VIDEO_GRANTS

**On Fail --> Diagnose:**
- Parts != 3 --> LiveKit SDK not generating valid JWT | check: `pip show livekit-api`
- Missing video grants --> AccessToken grants not applied | check: `VideoGrants(...)` in livekit.py

---

## Suite 4: SESSION (11 tests)

| ID | Name | Severity | Perf Key |
|---|---|---|---|
| S-1 | Create session | HIGH | session_create |
| S-2 | Dispatch session | HIGH | session_dispatch |
| S-3 | Complete session | HIGH | session_complete |
| S-4 | Fail session | HIGH | - |
| S-5 | Get session by ID | HIGH | session_get |
| S-6 | List user sessions | HIGH | session_list |
| S-7 | Patch session | HIGH | - |
| S-8 | End session | HIGH | - |
| S-9 | User sessions (JWT) | HIGH | - |
| S-10 | State machine guard | MED | - |
| S-11 | Sessions by device | HIGH | - |

---

### S-1: Create Session
> POST /api/internal/sessions | Auth: none (internal) | Severity: HIGH | Deps: A-1 (needs VI_USER_ID) | Perf: session_create

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$VI_USER_ID\",\"context\":{\"source\":\"qa_test\"}}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)

export SESSION_ID=$(echo "$BODY" | jq -r '.session_id')
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.session_id'` --> PASS_HAS_SESSION_ID
- `[ ${#SESSION_ID} -eq 36 ]` --> PASS_UUID_FORMAT

**On Fail --> Diagnose:**
- HTTP 404 + "No user found" --> VI_USER_ID not captured from A-1 or user not in DB | check: `echo "VI_USER_ID=$VI_USER_ID"`
- HTTP 422 --> Missing vi_user_id in body | check: request payload
- HTTP 500 --> DB connection or schema error | check: `docker logs vi-api 2>&1 | tail -20`

**Perf:** session_create (baseline: 150ms)

---

### S-2: Dispatch Session
> POST /api/internal/sessions/{id}/dispatch | Auth: none (internal) | Severity: HIGH | Deps: S-1 | Perf: session_dispatch

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/internal/sessions/$SESSION_ID/dispatch" \
  -H "Content-Type: application/json" \
  -d "{\"executor\":\"task_executor\",\"prompt\":\"QA test prompt\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE

**On Fail --> Diagnose:**
- HTTP 404 --> SESSION_ID not set or session was deleted | check: `echo "SESSION_ID=$SESSION_ID"`
- HTTP 422 --> Missing executor or prompt fields | check: request payload
- HTTP 500 --> Redis publish error (non-fatal but may log warning) | check: `docker logs vi-api 2>&1 | grep redis`

**Perf:** session_dispatch (baseline: 100ms)

---

### S-3: Complete Session
> POST /api/internal/sessions/{id}/complete | Auth: none (internal) | Severity: HIGH | Deps: S-2 | Perf: session_complete

Create a fresh session for this test (S-1's session was dispatched and will be used for S-5/S-6).

**Execute:**
```bash
# Create a fresh session to test the full lifecycle
FRESH=$(curl -s -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$VI_USER_ID\",\"context\":{}}")
COMPLETE_SID=$(echo "$FRESH" | jq -r '.session_id')

# Dispatch it first
curl -s -X POST "$API_URL/api/internal/sessions/$COMPLETE_SID/dispatch" \
  -H "Content-Type: application/json" \
  -d "{\"executor\":\"task_executor\",\"prompt\":\"complete test\"}" > /dev/null

# Now complete
RESULT=$(timed_curl -X POST "$API_URL/api/internal/sessions/$COMPLETE_SID/complete" \
  -H "Content-Type: application/json" \
  -d "{\"result\":{\"summary\":\"QA completed\",\"html\":\"<p>Done</p>\"}}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE

**On Fail --> Diagnose:**
- HTTP 404 --> Session not found (created session failed silently) | check: verify COMPLETE_SID
- HTTP 422 --> result must be a dict, not null | check: `{"result": {...}}`
- HTTP 500 --> DB write error | check: `docker logs vi-api 2>&1 | tail -10`

**Perf:** session_complete (baseline: 150ms)

---

### S-4: Fail Session
> POST /api/internal/sessions/{id}/fail | Auth: none (internal) | Severity: HIGH | Deps: A-1 | Perf: -

**Execute:**
```bash
# Create + dispatch a session, then fail it
FRESH=$(curl -s -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$VI_USER_ID\",\"context\":{}}")
FAIL_SID=$(echo "$FRESH" | jq -r '.session_id')

curl -s -X POST "$API_URL/api/internal/sessions/$FAIL_SID/dispatch" \
  -H "Content-Type: application/json" \
  -d "{\"executor\":\"task_executor\",\"prompt\":\"fail test\"}" > /dev/null

RESULT=$(timed_curl -X POST "$API_URL/api/internal/sessions/$FAIL_SID/fail" \
  -H "Content-Type: application/json" \
  -d "{\"error\":\"QA simulated failure\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE

**On Fail --> Diagnose:**
- HTTP 404 --> Session ID invalid | check: `echo "FAIL_SID=$FAIL_SID"`
- HTTP 422 --> Missing error field | check: request body must have `{"error": "string"}`

---

### S-5: Get Session by ID
> GET /api/internal/sessions/{id} | Auth: none (internal) | Severity: HIGH | Deps: S-2 | Perf: session_get

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/internal/sessions/$SESSION_ID")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.id'` --> PASS_HAS_ID
- `echo "$BODY" | jq -e '.status == "dispatched"'` --> PASS_STATUS_DISPATCHED
- `echo "$BODY" | jq -e '.prompt == "QA test prompt"'` --> PASS_PROMPT_MATCH
- `echo "$BODY" | jq -e '.executor == "task_executor"'` --> PASS_EXECUTOR_MATCH
- `echo "$BODY" | jq -e '.room_name'` --> PASS_HAS_ROOM_NAME
- `echo "$BODY" | jq -e '.context'` --> PASS_HAS_CONTEXT

**On Fail --> Diagnose:**
- HTTP 404 --> Session was deleted or ID mismatch | check: `echo "SESSION_ID=$SESSION_ID"`
- status != "dispatched" --> Dispatch in S-2 failed silently | check: re-run S-2

**Perf:** session_get (baseline: 80ms)

---

### S-6: List User Sessions
> GET /api/internal/sessions/by-user/{vi_user_id} | Auth: none (internal) | Severity: HIGH | Deps: S-1 | Perf: session_list

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/internal/sessions/by-user/$VI_USER_ID")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.sessions | length > 0'` --> PASS_HAS_SESSIONS
- `echo "$BODY" | jq -e '.sessions[0].id'` --> PASS_SESSION_HAS_ID
- `echo "$BODY" | jq -e '.sessions[0].status'` --> PASS_SESSION_HAS_STATUS

**On Fail --> Diagnose:**
- HTTP 404 + "No user found" --> VI_USER_ID is wrong | check: `echo "VI_USER_ID=$VI_USER_ID"`
- sessions array empty --> Sessions were not created for this user | check: re-run S-1

**Perf:** session_list (baseline: 100ms)

---

### S-7: Patch Session
> PATCH /api/internal/sessions/{id} | Auth: none (internal) | Severity: HIGH | Deps: S-1 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X PATCH "$API_URL/api/internal/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"QA Test Session\",\"intention\":\"testing\",\"progress_step\":1,\"progress_total\":3,\"progress_message\":\"Step 1 of 3\",\"result_summary\":\"In progress\",\"artifacts\":[{\"type\":\"text\",\"content\":\"test\"}],\"timeline\":[{\"step\":\"start\",\"ts\":\"2026-02-28T00:00:00Z\"}]}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.title == "QA Test Session"'` --> PASS_TITLE_SET
- `echo "$BODY" | jq -e '.intention == "testing"'` --> PASS_INTENTION_SET
- `echo "$BODY" | jq -e '.progress_step == 1'` --> PASS_PROGRESS_STEP
- `echo "$BODY" | jq -e '.artifacts | length == 1'` --> PASS_ARTIFACTS_SET

**On Fail --> Diagnose:**
- HTTP 400 + "No fields to update" --> All fields in body were null | check: request payload formatting
- HTTP 404 --> Session not found | check: `echo "SESSION_ID=$SESSION_ID"`
- fields not updated --> Field name not in `allowed_fields` set | check: session_center.py `allowed_fields`

---

### S-8: End Session
> PATCH /api/internal/sessions/{id}/end | Auth: none (internal) | Severity: HIGH | Deps: S-1 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X PATCH "$API_URL/api/internal/sessions/$SESSION_ID/end" \
  -H "Content-Type: application/json" \
  -d "{}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE

**Verify ended_at was set:**
```bash
VERIFY=$(curl -s "$API_URL/api/internal/sessions/$SESSION_ID")
echo "$VERIFY" | jq -e '.ended_at != null'  # --> PASS_ENDED_AT_SET
```

**On Fail --> Diagnose:**
- HTTP 400 + "Invalid session_id" --> SESSION_ID is not a valid UUID | check: `echo "SESSION_ID=$SESSION_ID"`
- HTTP 404 --> Session not found | check: session may have been deleted

---

### S-9: User Sessions (JWT)
> GET /api/users/sessions | Auth: JWT | Severity: HIGH | Deps: A-3, L-3 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/users/sessions" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '. | type == "array"'` --> PASS_IS_ARRAY
- `echo "$BODY" | jq -e '.[0].id'` --> PASS_HAS_SESSION_ID
- `echo "$BODY" | jq -e '.[0].room_name'` --> PASS_HAS_ROOM_NAME
- `echo "$BODY" | jq -e '.[0].status'` --> PASS_HAS_STATUS
- `echo "$BODY" | jq -e '.[0].started_at'` --> PASS_HAS_STARTED_AT

**On Fail --> Diagnose:**
- HTTP 401 --> Token expired or invalid | check: token from A-3
- empty array --> No sessions for this user (L-3 may not have run) | check: run L-3 first
- HTTP 500 --> DB error | check: `docker logs vi-api 2>&1 | tail -10`

---

### S-10: State Machine Guard
> POST /api/internal/sessions/{id}/complete | Auth: none (internal) | Severity: MED | Deps: A-1 | Perf: -

Tests that completing a session directly from `created` status (skipping `dispatched`) is handled. The current implementation does NOT enforce state machine transitions -- this test documents the actual behavior.

**Execute:**
```bash
# Create a session (status=created) and try to complete it directly
FRESH=$(curl -s -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$VI_USER_ID\",\"context\":{}}")
GUARD_SID=$(echo "$FRESH" | jq -r '.session_id')

RESULT=$(timed_curl -X POST "$API_URL/api/internal/sessions/$GUARD_SID/complete" \
  -H "Content-Type: application/json" \
  -d "{\"result\":{\"summary\":\"skipped dispatch\"}}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ] || [ "$HTTP" = "400" ] || [ "$HTTP" = "409" ] || [ "$HTTP" = "422" ]` --> PASS_HANDLED
- Document actual behavior: If HTTP 200, state machine is permissive (no guard). If HTTP 400/409/422, state machine enforces transitions.

**On Fail --> Diagnose:**
- HTTP 500 --> Unhandled error in state transition | check: `docker logs vi-api 2>&1 | tail -10`
- HTTP 404 --> Session creation failed | check: `echo "GUARD_SID=$GUARD_SID"`

---

### S-11: Sessions by Device
> GET /api/users/sessions/by-device?vi_user_id=X | Auth: none | Severity: HIGH | Deps: L-1 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/users/sessions/by-device?vi_user_id=$ANON_VI_USER_ID")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.sessions | type == "array"'` --> PASS_IS_ARRAY
- `echo "$BODY" | jq -e '.sessions | length > 0'` --> PASS_NOT_EMPTY
- `echo "$BODY" | jq -e '.sessions[0].id'` --> PASS_HAS_SESSION_ID
- `echo "$BODY" | jq -e '.sessions[0].status'` --> PASS_HAS_STATUS

**On Fail --> Diagnose:**
- empty sessions array --> Anonymous user has no sessions or vi_user_id not found | check: `echo "ANON_VI_USER_ID=$ANON_VI_USER_ID"`
- HTTP 422 --> vi_user_id query param missing | check: URL format
- HTTP 500 --> DB error | check: `docker logs vi-api 2>&1 | tail -10`

---

## Suite 5: TASK (6 tests)

| ID | Name | Severity | Perf Key |
|---|---|---|---|
| T-1 | Create task | HIGH | task_create |
| T-2 | Update task | HIGH | task_update |
| T-3 | List tasks (JWT) | HIGH | task_list |
| T-4 | List tasks by device | HIGH | - |
| T-5 | Delete task (JWT) | HIGH | task_delete |
| T-6 | Delete task by device | HIGH | - |

---

### T-1: Create Task
> POST /api/internal/tasks | Auth: none (internal) | Severity: HIGH | Deps: A-1, S-1 | Perf: task_create

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/internal/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$VI_USER_ID\",\"session_id\":\"$SESSION_ID\",\"prompt\":\"QA test task\",\"context\":{\"source\":\"qa\"}}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)

export TASK_ID=$(echo "$BODY" | jq -r '.task_id')
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.task_id'` --> PASS_HAS_TASK_ID
- `[ ${#TASK_ID} -eq 36 ]` --> PASS_UUID_FORMAT

**On Fail --> Diagnose:**
- HTTP 404 + "No user found" --> VI_USER_ID invalid | check: `echo "VI_USER_ID=$VI_USER_ID"`
- HTTP 422 --> Missing required fields (vi_user_id, prompt) | check: request payload
- HTTP 500 --> Foreign key constraint failure (session_id invalid) | check: `echo "SESSION_ID=$SESSION_ID"`

**Perf:** task_create (baseline: 150ms)

---

### T-2: Update Task
> PATCH /api/internal/tasks/{id} | Auth: none (internal) | Severity: HIGH | Deps: T-1 | Perf: task_update

**Execute:**
```bash
RESULT=$(timed_curl -X PATCH "$API_URL/api/internal/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"complete\",\"result\":{\"output\":\"QA result\"},\"progress_step\":1,\"progress_total\":1}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE

**On Fail --> Diagnose:**
- HTTP 400 + "Invalid task_id" --> TASK_ID is not a UUID | check: `echo "TASK_ID=$TASK_ID"`
- HTTP 404 --> Task not found | check: T-1 may have failed
- HTTP 422 --> Missing status field | check: `{"status": "complete"}` is required

**Perf:** task_update (baseline: 100ms)

---

### T-3: List Tasks (JWT)
> GET /api/users/tasks | Auth: JWT | Severity: HIGH | Deps: A-3, T-1 | Perf: task_list

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/users/tasks" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '. | type == "array"'` --> PASS_IS_ARRAY
- `echo "$BODY" | jq -e '.[0].id'` --> PASS_HAS_ID
- `echo "$BODY" | jq -e '.[0].prompt'` --> PASS_HAS_PROMPT
- `echo "$BODY" | jq -e '.[0].status'` --> PASS_HAS_STATUS
- `echo "$BODY" | jq -e '.[0].created_at'` --> PASS_HAS_CREATED_AT

**On Fail --> Diagnose:**
- HTTP 401 --> Token expired | check: re-login
- empty array --> No tasks created for this user | check: run T-1 first

**Perf:** task_list (baseline: 100ms)

---

### T-4: List Tasks by Device
> GET /api/users/tasks/by-device?vi_user_id=X | Auth: none | Severity: HIGH | Deps: L-1 | Perf: -

**Execute:**
```bash
# First create a task for the anonymous user
ANON_TASK=$(curl -s -X POST "$API_URL/api/internal/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$ANON_VI_USER_ID\",\"prompt\":\"anon test task\",\"context\":{}}")
export ANON_TASK_ID=$(echo "$ANON_TASK" | jq -r '.task_id')

RESULT=$(timed_curl "$API_URL/api/users/tasks/by-device?vi_user_id=$ANON_VI_USER_ID")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '. | type == "array"'` --> PASS_IS_ARRAY
- `echo "$BODY" | jq -e '. | length > 0'` --> PASS_NOT_EMPTY

**On Fail --> Diagnose:**
- HTTP 422 + "min_length" --> vi_user_id query param missing or empty | check: `echo "ANON_VI_USER_ID=$ANON_VI_USER_ID"`
- empty array --> Anonymous user has no tasks or user not found (returns [] on unknown user) | check: run L-1 and create a task first

---

### T-5: Delete Task (JWT)
> DELETE /api/users/tasks/{id} | Auth: JWT | Severity: HIGH | Deps: T-1, A-3 | Perf: task_delete

**Execute:**
```bash
# Create a throwaway task to delete
DEL_TASK=$(curl -s -X POST "$API_URL/api/internal/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$VI_USER_ID\",\"prompt\":\"delete me\",\"context\":{}}")
DEL_TASK_ID=$(echo "$DEL_TASK" | jq -r '.task_id')

RESULT=$(timed_curl -X DELETE "$API_URL/api/users/tasks/$DEL_TASK_ID" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)

# Verify deletion: try to list and ensure it is gone
VERIFY=$(curl -s "$API_URL/api/users/tasks" -H "Authorization: Bearer $TOKEN")
STILL_EXISTS=$(echo "$VERIFY" | jq "[.[] | select(.id == \"$DEL_TASK_ID\")] | length")
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE
- `[ "$STILL_EXISTS" = "0" ]` --> PASS_TASK_GONE

**On Fail --> Diagnose:**
- HTTP 404 --> Task not found or user_id mismatch (token user != task owner) | check: task was created with correct VI_USER_ID
- HTTP 400 --> Invalid UUID format | check: `echo "DEL_TASK_ID=$DEL_TASK_ID"`
- HTTP 401 --> Token expired | check: re-login

**Perf:** task_delete (baseline: 100ms)

---

### T-6: Delete Task by Device
> DELETE /api/users/tasks/by-device/{id}?vi_user_id=X | Auth: none | Severity: HIGH | Deps: T-4 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X DELETE "$API_URL/api/users/tasks/by-device/$ANON_TASK_ID?vi_user_id=$ANON_VI_USER_ID")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE

**Verify 404 on re-delete:**
```bash
RE_DEL=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE "$API_URL/api/users/tasks/by-device/$ANON_TASK_ID?vi_user_id=$ANON_VI_USER_ID")
[ "$RE_DEL" = "404" ]  # --> PASS_IDEMPOTENT_404
```

**On Fail --> Diagnose:**
- HTTP 404 + "User not found" --> ANON_VI_USER_ID invalid | check: `echo "ANON_VI_USER_ID=$ANON_VI_USER_ID"`
- HTTP 404 + "Task not found" --> ANON_TASK_ID invalid or already deleted | check: `echo "ANON_TASK_ID=$ANON_TASK_ID"`

---

## Suite 6: MEMORY (11 tests)

| ID | Name | Severity | Perf Key |
|---|---|---|---|
| M-1 | Append memory (internal) | HIGH | mem_append |
| M-2 | Upsert memory (internal) | HIGH | mem_upsert |
| M-3 | Batch memory update | HIGH | mem_batch |
| M-4 | Get memory context | HIGH | mem_context |
| M-5 | List memory (JWT) | HIGH | mem_list |
| M-6 | Get memory file (JWT) | HIGH | mem_get |
| M-7 | Upsert memory (JWT) | HIGH | - |
| M-8 | Delete memory (JWT) | HIGH | mem_delete |
| M-9 | List memory by device | HIGH | - |
| M-10 | Upsert memory by device | HIGH | - |
| M-11 | Delete memory by device | HIGH | - |

---

### M-1: Append Memory (Internal)
> POST /api/internal/memories | Auth: none (internal) | Severity: HIGH | Deps: A-1 | Perf: mem_append

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/internal/memories" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$VI_USER_ID\",\"content\":\"User prefers dark mode. Timestamp: $(date -u +%s)\",\"type\":\"long_term\",\"source\":\"agent\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE
- `echo "$BODY" | jq -e '.filename == "agent-memory.md"'` --> PASS_FILENAME_AGENT_MEMORY

**On Fail --> Diagnose:**
- HTTP 404 + "No user found" --> VI_USER_ID invalid | check: `echo "VI_USER_ID=$VI_USER_ID"`
- HTTP 500 --> DB error on Memory table | check: `docker logs vi-api 2>&1 | tail -20`
- HTTP 503 --> Redis down (event publishing fails gracefully but warns) | check: `docker logs redis 2>&1 | tail -10`

**Perf:** mem_append (baseline: 150ms)

---

### M-2: Upsert Memory (Internal)
> PUT /api/internal/memories/{filename} | Auth: none (internal) | Severity: HIGH | Deps: A-1 | Perf: mem_upsert

**Execute:**
```bash
export MEMORY_FILENAME="qa-preferences.md"

RESULT=$(timed_curl -X PUT "$API_URL/api/internal/memories/$MEMORY_FILENAME" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$VI_USER_ID\",\"filename\":\"$MEMORY_FILENAME\",\"content\":\"Theme: dark\\nLanguage: en\",\"category\":\"preference\",\"source\":\"agent\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE
- `echo "$BODY" | jq -e '.filename == "qa-preferences.md"'` --> PASS_FILENAME_MATCH

**On Fail --> Diagnose:**
- HTTP 404 --> User not found | check: `echo "VI_USER_ID=$VI_USER_ID"`
- HTTP 422 --> Missing required fields (vi_user_id, filename, content) | check: request body

**Perf:** mem_upsert (baseline: 150ms)

---

### M-3: Batch Memory Update
> POST /api/internal/memories/batch | Auth: none (internal) | Severity: HIGH | Deps: A-1 | Perf: mem_batch

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/internal/memories/batch" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$VI_USER_ID\",\"updates\":[{\"filename\":\"session-summary.md\",\"content\":\"Session 1: user asked about weather\",\"category\":\"session_summary\",\"mode\":\"replace\"},{\"filename\":\"agent-memory.md\",\"content\":\"User mentioned they live in NYC\",\"category\":\"agent\",\"mode\":\"append\"}]}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE
- `echo "$BODY" | jq -e '.results | length == 2'` --> PASS_TWO_RESULTS
- `echo "$BODY" | jq -e '.results | all(.ok == true)'` --> PASS_ALL_OK

**On Fail --> Diagnose:**
- HTTP 422 --> Invalid updates array structure | check: each item needs filename, content, category, mode
- partial ok=false in results --> One file failed (user not found, etc.) | check: individual result errors
- HTTP 500 --> DB transaction error | check: `docker logs vi-api 2>&1 | tail -20`

**Perf:** mem_batch (baseline: 300ms)

---

### M-4: Get Memory Context
> GET /api/internal/memories/context/{vi_user_id} | Auth: none (internal) | Severity: HIGH | Deps: M-1, M-2 | Perf: mem_context

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/internal/memories/context/$VI_USER_ID?max_chars=2000")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.context'` --> PASS_HAS_CONTEXT
- `echo "$BODY" | jq -r '.context' | wc -c | xargs test 1 -lt` --> PASS_NOT_EMPTY
- `echo "$BODY" | jq -r '.context' | wc -c | xargs test 2001 -gt` --> PASS_UNDER_MAX_CHARS

**On Fail --> Diagnose:**
- HTTP 404 --> User not found | check: `echo "VI_USER_ID=$VI_USER_ID"`
- empty context string --> No memories were created | check: run M-1 and M-2 first
- context > 2000 chars --> Truncation logic broken | check: review `get_context_for_agent` in memory_center.py

**Perf:** mem_context (baseline: 100ms)

---

### M-5: List Memory (JWT)
> GET /api/users/memory | Auth: JWT | Severity: HIGH | Deps: A-3, M-2 | Perf: mem_list

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/users/memory" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '. | type == "array"'` --> PASS_IS_ARRAY
- `echo "$BODY" | jq -e '. | length > 0'` --> PASS_NOT_EMPTY
- `echo "$BODY" | jq -e '.[0].filename'` --> PASS_HAS_FILENAME
- `echo "$BODY" | jq -e '.[0].updated_at'` --> PASS_HAS_UPDATED_AT
- `echo "$BODY" | jq -e '.[0].preview'` --> PASS_HAS_PREVIEW

**On Fail --> Diagnose:**
- HTTP 401 --> Token expired or invalid | check: re-login
- empty array --> No memories for this user | check: run M-1 and M-2 first

**Perf:** mem_list (baseline: 100ms)

---

### M-6: Get Memory File (JWT)
> GET /api/users/memory/{filename} | Auth: JWT | Severity: HIGH | Deps: M-2 | Perf: mem_get

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/users/memory/$MEMORY_FILENAME" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.filename == "qa-preferences.md"'` --> PASS_FILENAME_MATCH
- `echo "$BODY" | jq -e '.content | length > 0'` --> PASS_HAS_CONTENT
- `echo "$BODY" | jq -e '.updated_at'` --> PASS_HAS_UPDATED_AT

**On Fail --> Diagnose:**
- HTTP 404 + "Memory file not found" --> Filename mismatch or M-2 failed | check: `echo "MEMORY_FILENAME=$MEMORY_FILENAME"`
- HTTP 401 --> Token expired | check: re-login

**Perf:** mem_get (baseline: 100ms)

---

### M-7: Upsert Memory (JWT)
> PUT /api/users/memory/{filename} | Auth: JWT | Severity: HIGH | Deps: A-3 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X PUT "$API_URL/api/users/memory/user-notes.md" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"My personal notes from QA test\",\"category\":\"general\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.filename == "user-notes.md"'` --> PASS_FILENAME_MATCH
- `echo "$BODY" | jq -e '.content | length > 0'` --> PASS_HAS_CONTENT
- `echo "$BODY" | jq -e '.updated_at'` --> PASS_HAS_UPDATED_AT

**On Fail --> Diagnose:**
- HTTP 401 --> Token expired | check: re-login
- HTTP 422 --> Missing content field | check: body must have `{"content": "..."}`

---

### M-8: Delete Memory (JWT)
> DELETE /api/users/memory/{filename} | Auth: JWT | Severity: HIGH | Deps: M-7 | Perf: mem_delete

**Execute:**
```bash
RESULT=$(timed_curl -X DELETE "$API_URL/api/users/memory/user-notes.md" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)

# Verify deletion
VERIFY=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_URL/api/users/memory/user-notes.md" \
  -H "Authorization: Bearer $TOKEN")
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE
- `[ "$VERIFY" = "404" ]` --> PASS_ACTUALLY_DELETED

**On Fail --> Diagnose:**
- HTTP 401 --> Token expired | check: re-login
- VERIFY = 200 --> Delete did not remove the record | check: review `delete_memory` in memory_center.py

**Perf:** mem_delete (baseline: 100ms)

---

### M-9: List Memory by Device
> GET /api/users/memory/by-device?vi_user_id=X | Auth: none | Severity: HIGH | Deps: L-1 | Perf: -

**Execute:**
```bash
# First create a memory for the anonymous user
curl -s -X PUT "$API_URL/api/internal/memories/device-test.md" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\":\"$ANON_VI_USER_ID\",\"filename\":\"device-test.md\",\"content\":\"device memory\",\"category\":\"general\",\"source\":\"agent\"}" > /dev/null

RESULT=$(timed_curl "$API_URL/api/users/memory/by-device?vi_user_id=$ANON_VI_USER_ID")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '. | type == "array"'` --> PASS_IS_ARRAY
- `echo "$BODY" | jq -e '. | length > 0'` --> PASS_NOT_EMPTY
- `echo "$BODY" | jq -e '.[0].filename'` --> PASS_HAS_FILENAME

**On Fail --> Diagnose:**
- empty array --> Unknown vi_user_id or no memories created | check: `echo "ANON_VI_USER_ID=$ANON_VI_USER_ID"`
- HTTP 422 --> Missing vi_user_id query param | check: URL format

---

### M-10: Upsert Memory by Device
> PUT /api/users/memory/by-device/{filename}?vi_user_id=X | Auth: none | Severity: HIGH | Deps: L-1 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X PUT "$API_URL/api/users/memory/by-device/device-user-note.md?vi_user_id=$ANON_VI_USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"Device user note from QA\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.filename == "device-user-note.md"'` --> PASS_FILENAME_MATCH
- `echo "$BODY" | jq -e '.content | length > 0'` --> PASS_HAS_CONTENT

**On Fail --> Diagnose:**
- HTTP 404 + "User not found" --> ANON_VI_USER_ID invalid | check: `echo "ANON_VI_USER_ID=$ANON_VI_USER_ID"`
- HTTP 422 --> Missing content in body | check: `{"content": "..."}`

---

### M-11: Delete Memory by Device
> DELETE /api/users/memory/by-device/{filename}?vi_user_id=X | Auth: none | Severity: HIGH | Deps: M-10 | Perf: -

**Execute:**
```bash
RESULT=$(timed_curl -X DELETE "$API_URL/api/users/memory/by-device/device-user-note.md?vi_user_id=$ANON_VI_USER_ID")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)

# Verify deletion
VERIFY=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_URL/api/users/memory/by-device/device-user-note.md?vi_user_id=$ANON_VI_USER_ID")
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.ok == true'` --> PASS_OK_TRUE
- `[ "$VERIFY" = "404" ]` --> PASS_ACTUALLY_DELETED

**On Fail --> Diagnose:**
- HTTP 404 + "User not found" --> ANON_VI_USER_ID invalid | check: `echo "ANON_VI_USER_ID=$ANON_VI_USER_ID"`
- VERIFY = 200 --> Delete is a no-op (memory not actually removed) | check: review `delete_memory`

---

## Suite 7: UPLOAD (2 tests)

| ID | Name | Severity | Perf Key |
|---|---|---|---|
| U-1 | Get presigned URL | HIGH | upload_presign |
| U-2 | Upload flow | MED | - |

---

### U-1: Get Presigned URL
> GET /api/upload/presign?ext=jpg | Auth: none | Severity: HIGH | Deps: none | Perf: upload_presign

**Execute:**
```bash
RESULT=$(timed_curl "$API_URL/api/upload/presign?ext=jpg")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)

export PRESIGNED_PUT_URL=$(echo "$BODY" | jq -r '.presigned_url')
export PUBLIC_URL=$(echo "$BODY" | jq -r '.public_url')
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.presigned_url | startswith("https://")'` --> PASS_PRESIGNED_URL_HTTPS
- `echo "$BODY" | jq -e '.public_url'` --> PASS_HAS_PUBLIC_URL
- `echo "$BODY" | jq -e '.key | startswith("photos/")'` --> PASS_KEY_PREFIX
- `echo "$BODY" | jq -e '.content_type == "image/jpeg"'` --> PASS_CONTENT_TYPE

**On Fail --> Diagnose:**
- HTTP 500 + "Failed to generate" --> GCP credentials missing or invalid | check: `GOOGLE_APPLICATION_CREDENTIALS` env var
- HTTP 422 --> ext param not matching allowed pattern | check: must be jpg|jpeg|png|webp|mp4|webm
- HTTP 429 --> Rate limit hit (20/min) | check: wait and retry

**Perf:** upload_presign (baseline: 300ms)

---

### U-2: Upload Flow (Presign + PUT)
> GET+PUT | Auth: none | Severity: MED | Deps: U-1 | Perf: -

**Execute:**
```bash
# Create a tiny test image (1x1 pixel JPEG)
echo -n -e '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00' > /tmp/qa_test.jpg

# Upload using the presigned URL from U-1
UPLOAD_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT "$PRESIGNED_PUT_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @/tmp/qa_test.jpg)

# Verify the public URL is accessible
PUBLIC_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$PUBLIC_URL")

rm -f /tmp/qa_test.jpg
```

**Assert:**
- `[ "$UPLOAD_HTTP" = "200" ]` --> PASS_S3_UPLOAD_200
- `[ "$PUBLIC_HTTP" = "200" ]` --> PASS_PUBLIC_ACCESSIBLE

**On Fail --> Diagnose:**
- UPLOAD_HTTP 403 --> Presigned URL expired (>5 min) or GCS policy block | check: re-run U-1 and upload immediately
- UPLOAD_HTTP 400 --> Content-Type mismatch (must match presign) | check: ensure `image/jpeg` header
- PUBLIC_HTTP 403 --> Bucket policy does not allow public read and presigned GET expired | check: GCS bucket policy
- PUBLIC_HTTP 404 --> Object not uploaded or key mismatch | check: verify GCS console

---

## Suite 8: EVENTS (2 tests)

| ID | Name | Severity | Perf Key |
|---|---|---|---|
| E-1 | SSE stream (JWT) | HIGH | sse_connect |
| E-2 | SSE stream (device) | HIGH | - |

---

### E-1: SSE Stream (JWT)
> GET /api/users/events | Auth: JWT | Severity: HIGH | Deps: A-3 | Perf: sse_connect

**Execute:**
```bash
# Connect to SSE and capture first few seconds of output
RESULT=$(timeout 5 curl -s -N \
  "$API_URL/api/users/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream" \
  2>/dev/null || true)
CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" \
  "$API_URL/api/users/events" \
  -H "Authorization: Bearer $TOKEN" \
  --max-time 2 2>/dev/null || true)
```

**Assert:**
- `echo "$CONTENT_TYPE" | grep -q "text/event-stream"` --> PASS_SSE_CONTENT_TYPE
- The connection should stay open (not immediately close with an error body)

**On Fail --> Diagnose:**
- HTTP 503 + "Redis not connected" --> Redis is down | check: `docker logs redis 2>&1 | tail -10`
- HTTP 401 --> Token invalid or expired | check: re-login
- content_type != text/event-stream --> SSE endpoint returning JSON error instead | check: response body

**Perf:** sse_connect (baseline: 200ms)

---

### E-2: SSE Stream (Device)
> GET /api/users/events?vi_user_id=X | Auth: none | Severity: HIGH | Deps: L-1 | Perf: -

**Execute:**
```bash
CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" \
  "$API_URL/api/users/events?vi_user_id=$ANON_VI_USER_ID" \
  --max-time 2 2>/dev/null || true)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_URL/api/users/events?vi_user_id=$ANON_VI_USER_ID" \
  --max-time 2 2>/dev/null || true)
```

**Assert:**
- `echo "$CONTENT_TYPE" | grep -q "text/event-stream"` --> PASS_SSE_CONTENT_TYPE
- `[ "$HTTP" != "401" ]` --> PASS_DEVICE_AUTH_WORKS

**On Fail --> Diagnose:**
- HTTP 401 --> Device-based auth not resolving vi_user_id | check: `get_current_user_or_device` in deps.py
- HTTP 503 --> Redis unavailable | check: `docker logs redis 2>&1 | tail -10`
- HTTP 422 --> vi_user_id param missing | check: URL format

---

## Suite 9: GATEWAY PROXY (2 tests)

| ID | Name | Severity | Perf Key |
|---|---|---|---|
| G-1 | Gateway join proxy | MED | gateway_join |
| G-2 | GCS presign-get | MED | gcs_presign |

---

### G-1: Gateway Join Proxy
> POST /api/internal/gateway/join | Auth: none (internal) | Severity: MED | Deps: none | Perf: gateway_join

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/internal/gateway/join" \
  -H "Content-Type: application/json" \
  -d "{\"room_name\":\"qa-test-room-$(date +%s)\"}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ] || [ "$HTTP" = "502" ]` --> PASS_HANDLED
- If HTTP 502: gateway is down (expected in test environments without vi-gateway running)
- If HTTP 200: gateway responded successfully

**On Fail --> Diagnose:**
- HTTP 502 + "Gateway join failed" --> vi-gateway service not running (expected in dev/test) | check: `docker ps | grep vi-gateway`
- HTTP 422 --> Missing room_name field | check: request body format
- timeout --> Gateway service unreachable and httpx 10s timeout exceeded | check: `GATEWAY_URL` env var

**Perf:** gateway_join (baseline: 500ms)

---

### G-2: GCS Presign-Get
> POST /api/internal/storage/presign-get | Auth: none (internal) | Severity: MED | Deps: none | Perf: gcs_presign

**Execute:**
```bash
RESULT=$(timed_curl -X POST "$API_URL/api/internal/storage/presign-get" \
  -H "Content-Type: application/json" \
  -d "{\"urls\":[\"https://storage.googleapis.com/vi-uploads/photos/2026/02/28/test123.jpg\",\"https://example.com/not-gcs.png\"]}")
BODY=$(echo "$RESULT" | sed '/^---HTTP:/d')
HTTP=$(echo "$RESULT" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
MS=$(echo "$RESULT" | grep -o 'MS:[0-9]*' | cut -d: -f2)
```

**Assert:**
- `[ "$HTTP" = "200" ]` --> PASS_STATUS_200
- `echo "$BODY" | jq -e '.urls'` --> PASS_HAS_URLS
- `echo "$BODY" | jq -e '.urls | keys | length == 2'` --> PASS_TWO_RESULTS
- GCS URL should be signed: `echo "$BODY" | jq -r '.urls["https://storage.googleapis.com/vi-uploads/photos/2026/02/28/test123.jpg"]' | grep -q "X-Goog-Signature"` --> PASS_GCS_SIGNED
- Non-GCS URL should pass through: `echo "$BODY" | jq -r '.urls["https://example.com/not-gcs.png"]' | grep -q "example.com"` --> PASS_NON_GCS_PASSTHROUGH

**On Fail --> Diagnose:**
- HTTP 500 --> GCP credentials missing | check: `GOOGLE_APPLICATION_CREDENTIALS` env var
- GCS URL not signed --> GCS URL pattern regex mismatch (bucket name) | check: `GCS_BUCKET` env var and `_GCS_URL_PATTERN` in internal.py
- HTTP 422 --> urls must be a list | check: `{"urls": [...]}`

**Perf:** gcs_presign (baseline: 200ms)

---

## Performance Baseline Reference

Save as `perf_baseline.json` alongside this document:

```json
{
  "health_check": 50,
  "swagger_load": 200,
  "auth_signup": 300,
  "auth_login": 400,
  "auth_me": 100,
  "livekit_anon": 500,
  "livekit_auth": 400,
  "session_create": 150,
  "session_dispatch": 100,
  "session_complete": 150,
  "session_get": 80,
  "session_list": 100,
  "task_create": 150,
  "task_update": 100,
  "task_list": 100,
  "task_delete": 100,
  "mem_append": 150,
  "mem_upsert": 150,
  "mem_batch": 300,
  "mem_context": 100,
  "mem_list": 100,
  "mem_get": 100,
  "mem_delete": 100,
  "upload_presign": 300,
  "sse_connect": 200,
  "gateway_join": 500,
  "gcs_presign": 200
}
```

---

## Report Generation

After running all tests, the QA agent should produce a structured report. The following template should be populated:

### Report Template

```markdown
# VI Backend QA Report
**Date:** {date}
**Environment:** {API_URL}
**Test Run ID:** {PID}_{timestamp}

## Summary
| Metric | Value |
|---|---|
| Total Tests | 48 |
| Passed | {N} |
| Failed | {N} |
| Skipped | {N} |
| Pass Rate | {N}% |
| Critical Failures | {N} |

## Results by Suite
| Suite | Total | Pass | Fail | Skip |
|---|---|---|---|---|
| HEALTH | 2 | {n} | {n} | {n} |
| AUTH | 8 | {n} | {n} | {n} |
| LIVEKIT | 4 | {n} | {n} | {n} |
| SESSION | 11 | {n} | {n} | {n} |
| TASK | 6 | {n} | {n} | {n} |
| MEMORY | 11 | {n} | {n} | {n} |
| UPLOAD | 2 | {n} | {n} | {n} |
| EVENTS | 2 | {n} | {n} | {n} |
| GATEWAY | 2 | {n} | {n} | {n} |

## Failed Tests
| ID | Name | Severity | HTTP | Error | Root Cause |
|---|---|---|---|---|---|
| {id} | {name} | {sev} | {code} | {msg} | {diagnosis} |

## Performance Results
| Key | Measured (ms) | Baseline (ms) | Delta | Status |
|---|---|---|---|---|
| {key} | {actual} | {baseline} | {+/-N}ms | {OK/SLOW/FAST} |

## Diagnosis Log
{For each failure, include the diagnostic command output}

## Recommendations
{List any issues discovered during testing}
```

### Generating the Report

```bash
#!/bin/bash
# Save as: run_qa.sh
# Usage: ./run_qa.sh [API_URL]

set -euo pipefail

export API_URL="${1:-http://localhost:8000}"
export TEST_EMAIL="e2e_test_${$}_$(date +%s)@vitest.local"
export TEST_PASSWORD="TestPass_${$}_$(date +%s)"
export TEST_DISPLAY_NAME="E2E Bot $$"
export DEVICE_ID="e2e-device-${$}-$(date +%s)"

PASS=0 FAIL=0 SKIP=0
REPORT=""

check() {
  local test_id="$1" assertion="$2" label="$3"
  if eval "$assertion" > /dev/null 2>&1; then
    ((PASS++))
    REPORT+="| $test_id | $label | PASS |\n"
  else
    ((FAIL++))
    REPORT+="| $test_id | $label | FAIL |\n"
  fi
}

# Run all suites in order...
# (Execute each test block from this document, calling check() for each assertion)

TOTAL=$((PASS + FAIL + SKIP))
RATE=$(( PASS * 100 / (TOTAL > 0 ? TOTAL : 1) ))
echo "=== QA Summary: $PASS/$TOTAL passed ($RATE%) ==="
echo -e "$REPORT"
```

### Performance Comparison

```bash
# Compare measured results against baseline
jq -s '
  .[0] as $baseline |
  .[1] as $measured |
  [$measured | to_entries[] |
    {
      key: .key,
      measured: .value,
      baseline: ($baseline[.key] // "N/A"),
      delta: (if $baseline[.key] then (.value - $baseline[.key]) else null end),
      status: (if $baseline[.key] then
        if .value <= $baseline[.key] * 1.5 then "OK"
        elif .value <= $baseline[.key] * 3 then "SLOW"
        else "CRITICAL"
        end
      else "NEW" end)
    }
  ]
' perf_baseline.json perf_results.json
```

---

## Test Execution Order

Tests must run in this order due to data dependencies:

```
1. H-1, H-2                          (no deps)
2. A-1                                (creates user, captures TOKEN, VI_USER_ID)
3. A-2, A-3, A-4, A-5                (need A-1 user)
4. A-6, A-7, A-8                     (A-6 needs TOKEN from A-3)
5. L-1                                (captures ANON_VI_USER_ID, ANON_SESSION_ID)
6. L-2, L-3, L-4                     (L-2 needs L-1 device; L-3 needs TOKEN)
7. S-1                                (needs VI_USER_ID, captures SESSION_ID)
8. S-2 through S-10                   (need SESSION_ID)
8b. S-11                               (needs ANON_VI_USER_ID from L-1)
9. T-1                                (needs VI_USER_ID, SESSION_ID)
10. T-2 through T-6                   (need TASK_ID, ANON_VI_USER_ID)
11. M-1 through M-4                   (need VI_USER_ID)
12. M-5 through M-8                   (need TOKEN)
13. M-9 through M-11                  (need ANON_VI_USER_ID)
14. U-1, U-2                          (no auth deps, need GCP creds)
15. E-1, E-2                          (need TOKEN, ANON_VI_USER_ID, Redis)
16. G-1, G-2                          (no deps, may 502 without gateway)
```

---

## Notes

- **Rate Limiting:** Auth endpoints are rate-limited (signup 5/min, login 10/min, livekit 10/min, upload 20/min). If running tests repeatedly, wait between runs or disable rate limiting in test config.
- **Redis Optional:** SSE tests (E-1, E-2) require Redis. If Redis is down, they return 503 -- this is expected graceful degradation, not a bug.
- **Gateway Optional:** G-1 will return 502 if vi-gateway is not running. This is expected in dev/test environments.
- **S3 Required for Upload:** U-1 and U-2 require valid GCP credentials. Without them, U-1 returns 500.
- **LiveKit Keys Required:** L-1, L-2, L-3 require `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` to generate valid tokens.
- **Cleanup:** Test data is isolated by unique email/device_id per run. No cleanup is strictly required, but accumulated test data can be purged by deleting users matching `*@vitest.local`.
