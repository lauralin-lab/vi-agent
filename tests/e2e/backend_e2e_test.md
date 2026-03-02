# VI-Agent Backend E2E Test Handbook

> Complete guide for a Claude Code agent to execute backend end-to-end testing against the live cloud deployment.

---

## 1. Prerequisites & Environment Setup / 前置条件与环境配置

### Purpose

This document provides every curl command, expected response, and validation step needed to fully test the VI-Agent backend API. It is designed to be executed by a Claude Code agent without any additional context.

### Target System

| Property | Value |
|---|---|
| Default URL | `http://YOUR_SERVER_IP:8000` |
| Env override | `VI_TEST_API_URL` |
| Stack | FastAPI + PostgreSQL + Redis + LiveKit + S3 |

### Required Tools

- `curl` (with `-w` timing support)
- `jq` (JSON parsing)
- `date` (ISO timestamp generation)
- `uuidgen` or `$RANDOM` (unique ID generation)

### Environment Variables

Set these before running any tests:

```bash
# Base API URL — override with VI_TEST_API_URL if needed
export API_URL="${VI_TEST_API_URL:-http://YOUR_SERVER_IP:8000}"

# Generate unique test user identity per run (PID-based for isolation)
export TEST_EMAIL="e2e_test_${$}_$(date +%s)@vitest.local"
export TEST_PASSWORD="TestPass_${$}_$(date +%s)"
export TEST_DISPLAY_NAME="E2E Bot $$"

# These will be populated during test execution
export TOKEN=""
export VI_USER_ID=""
export SESSION_ID=""
export TASK_ID=""
export DEVICE_ID="e2e-device-${$}-$(date +%s)"

# Timing format for latency measurements
export CURL_TIMING='-w "\n%{http_code} %{time_total}"'
```

### Test Isolation

Each test run creates a unique user with a PID-based email address to avoid collisions with parallel runs. All created resources (users, sessions, memories, tasks) are scoped to this unique identity.

### Timing Helper

Define this function at the start of every test session:

```bash
# Measures request time in milliseconds and returns HTTP status + body
timed_curl() {
  local start=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000000000))")
  local response
  response=$(curl -s -w "\n%{http_code}" "$@")
  local end=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000000000))")
  local http_code=$(echo "$response" | tail -1)
  local body=$(echo "$response" | sed '$d')
  local duration_ms=$(( (end - start) / 1000000 ))
  echo "$body"
  echo "---HTTP_CODE:${http_code}---DURATION_MS:${duration_ms}---"
}
```

---

## 2. Test Suites / 测试套件

---

### Suite 1: HEALTH — 健康检查 (2 tests)

#### HEALTH-01: Health endpoint returns OK

| Field | Value |
|---|---|
| ID | HEALTH-01 |
| Name | Health endpoint returns OK |
| Method | GET /health |
| Auth | None |

**Steps:**

```bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
BODY=$(curl -s "$API_URL/health")
```

**Expected Result:**
- HTTP status: `200`
- Body: `{"status": "ok"}`

**Validation:**

```bash
# Check status code
[ "$RESPONSE" = "200" ] && echo "PASS: HEALTH-01 status" || echo "FAIL: HEALTH-01 status (got $RESPONSE)"

# Check body
STATUS=$(echo "$BODY" | jq -r '.status')
[ "$STATUS" = "ok" ] && echo "PASS: HEALTH-01 body" || echo "FAIL: HEALTH-01 body (got $STATUS)"
```

---

#### HEALTH-02: Swagger UI accessible

| Field | Value |
|---|---|
| ID | HEALTH-02 |
| Name | Swagger UI accessible at /docs |
| Method | GET /docs |
| Auth | None |

**Steps:**

```bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/docs")
```

**Expected Result:**
- HTTP status: `200`
- Response contains HTML with Swagger UI

**Validation:**

```bash
[ "$RESPONSE" = "200" ] && echo "PASS: HEALTH-02" || echo "FAIL: HEALTH-02 (got $RESPONSE)"
```

---

### Suite 2: AUTH — 认证系统 (8 tests)

#### AUTH-01: Signup creates new user

| Field | Value |
|---|---|
| ID | AUTH-01 |
| Name | Signup creates new user with token |
| Method | POST /api/auth/signup |
| Auth | None |
| Depends on | None |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"display_name\": \"$TEST_DISPLAY_NAME\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `201`
- Response contains `token` (non-empty string)
- Response contains `user` object with fields: `id`, `email`, `vi_user_id`, `display_name`
- `user.email` matches `$TEST_EMAIL`
- `user.vi_user_id` starts with `vi_`

**Validation:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"auth01_verify_${$}@vitest.local\",
    \"password\": \"$TEST_PASSWORD\",
    \"display_name\": \"$TEST_DISPLAY_NAME\"
  }")

# For the main test user, parse and store token
TOKEN=$(echo "$BODY" | jq -r '.token')
VI_USER_ID_AUTH=$(echo "$BODY" | jq -r '.user.vi_user_id')
USER_EMAIL=$(echo "$BODY" | jq -r '.user.email')
USER_ID=$(echo "$BODY" | jq -r '.user.id')

[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && echo "PASS: AUTH-01 token present" || echo "FAIL: AUTH-01 no token"
[ "$USER_EMAIL" = "$TEST_EMAIL" ] && echo "PASS: AUTH-01 email match" || echo "FAIL: AUTH-01 email mismatch"
[ -n "$VI_USER_ID_AUTH" ] && [ "$VI_USER_ID_AUTH" != "null" ] && echo "PASS: AUTH-01 vi_user_id present" || echo "FAIL: AUTH-01 no vi_user_id"

# Store for subsequent tests
export TOKEN
export VI_USER_ID_AUTH
```

---

#### AUTH-02: Duplicate signup rejected

| Field | Value |
|---|---|
| ID | AUTH-02 |
| Name | Duplicate signup returns 409 |
| Method | POST /api/auth/signup |
| Auth | None |
| Depends on | AUTH-01 |

**Steps:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"display_name\": \"$TEST_DISPLAY_NAME\"
  }")
```

**Expected Result:**
- HTTP status: `409` (Conflict)

**Validation:**

```bash
[ "$HTTP_CODE" = "409" ] && echo "PASS: AUTH-02" || echo "FAIL: AUTH-02 (got $HTTP_CODE)"
```

---

#### AUTH-03: Login with correct credentials

| Field | Value |
|---|---|
| ID | AUTH-03 |
| Name | Login returns token |
| Method | POST /api/auth/login |
| Auth | None |
| Depends on | AUTH-01 |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response contains `token` (non-empty string)
- Response contains `user` object with matching `email`

**Validation:**

```bash
LOGIN_TOKEN=$(echo "$BODY" | jq -r '.token')
LOGIN_EMAIL=$(echo "$BODY" | jq -r '.user.email')

[ -n "$LOGIN_TOKEN" ] && [ "$LOGIN_TOKEN" != "null" ] && echo "PASS: AUTH-03 token" || echo "FAIL: AUTH-03 no token"
[ "$LOGIN_EMAIL" = "$TEST_EMAIL" ] && echo "PASS: AUTH-03 email" || echo "FAIL: AUTH-03 email mismatch"

# Update TOKEN to use fresh login token
export TOKEN="$LOGIN_TOKEN"
```

---

#### AUTH-04: Login with wrong password

| Field | Value |
|---|---|
| ID | AUTH-04 |
| Name | Wrong password returns 401 |
| Method | POST /api/auth/login |
| Auth | None |

**Steps:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"wrong_password_12345\"
  }")
```

**Expected Result:**
- HTTP status: `401`

**Validation:**

```bash
[ "$HTTP_CODE" = "401" ] && echo "PASS: AUTH-04" || echo "FAIL: AUTH-04 (got $HTTP_CODE)"
```

---

#### AUTH-05: Login with nonexistent user

| Field | Value |
|---|---|
| ID | AUTH-05 |
| Name | Nonexistent user returns 401 |
| Method | POST /api/auth/login |
| Auth | None |

**Steps:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"nonexistent_user_${$}@vitest.local\",
    \"password\": \"some_password\"
  }")
```

**Expected Result:**
- HTTP status: `401`

**Validation:**

```bash
[ "$HTTP_CODE" = "401" ] && echo "PASS: AUTH-05" || echo "FAIL: AUTH-05 (got $HTTP_CODE)"
```

---

#### AUTH-06: Get profile with valid token

| Field | Value |
|---|---|
| ID | AUTH-06 |
| Name | /me returns user profile with valid JWT |
| Method | GET /api/auth/me |
| Auth | Bearer $TOKEN |
| Depends on | AUTH-03 |

**Steps:**

```bash
BODY=$(curl -s -X GET "$API_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response fields: `id`, `email`, `vi_user_id`, `display_name`, `is_active`, `created_at`, `last_login`
- `email` matches `$TEST_EMAIL`
- `is_active` is `true`

**Validation:**

```bash
ME_EMAIL=$(echo "$BODY" | jq -r '.email')
ME_ACTIVE=$(echo "$BODY" | jq -r '.is_active')
ME_VI_USER_ID=$(echo "$BODY" | jq -r '.vi_user_id')
ME_CREATED=$(echo "$BODY" | jq -r '.created_at')

[ "$ME_EMAIL" = "$TEST_EMAIL" ] && echo "PASS: AUTH-06 email" || echo "FAIL: AUTH-06 email"
[ "$ME_ACTIVE" = "true" ] && echo "PASS: AUTH-06 is_active" || echo "FAIL: AUTH-06 is_active=$ME_ACTIVE"
[ -n "$ME_VI_USER_ID" ] && [ "$ME_VI_USER_ID" != "null" ] && echo "PASS: AUTH-06 vi_user_id" || echo "FAIL: AUTH-06 no vi_user_id"
[ -n "$ME_CREATED" ] && [ "$ME_CREATED" != "null" ] && echo "PASS: AUTH-06 created_at" || echo "FAIL: AUTH-06 no created_at"
```

---

#### AUTH-07: Get profile without token

| Field | Value |
|---|---|
| ID | AUTH-07 |
| Name | /me without Authorization header returns 403 |
| Method | GET /api/auth/me |
| Auth | None |

**Steps:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/auth/me")
```

**Expected Result:**
- HTTP status: `403`

**Validation:**

```bash
[ "$HTTP_CODE" = "403" ] && echo "PASS: AUTH-07" || echo "FAIL: AUTH-07 (got $HTTP_CODE)"
```

---

#### AUTH-08: Get profile with invalid token

| Field | Value |
|---|---|
| ID | AUTH-08 |
| Name | /me with garbage token returns 401 |
| Method | GET /api/auth/me |
| Auth | Bearer invalid_garbage_token |

**Steps:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/auth/me" \
  -H "Authorization: Bearer invalid_garbage_token_xyz")
```

**Expected Result:**
- HTTP status: `401`

**Validation:**

```bash
[ "$HTTP_CODE" = "401" ] && echo "PASS: AUTH-08" || echo "FAIL: AUTH-08 (got $HTTP_CODE)"
```

---

### Suite 3: LIVEKIT — 实时通信令牌 (4 tests)

#### LK-01: Anonymous token creation

| Field | Value |
|---|---|
| ID | LK-01 |
| Name | Anonymous token returns token, room, vi_user_id, session_id |
| Method | POST /api/livekit/anonymous |
| Auth | None |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/livekit/anonymous" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\": \"$DEVICE_ID\"}")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response fields: `token`, `room_name`, `livekit_url`, `vi_user_id`, `session_id`
- All fields are non-empty strings

**Validation:**

```bash
LK_TOKEN=$(echo "$BODY" | jq -r '.token')
LK_ROOM=$(echo "$BODY" | jq -r '.room_name')
LK_URL=$(echo "$BODY" | jq -r '.livekit_url')
LK_VI_USER=$(echo "$BODY" | jq -r '.vi_user_id')
LK_SESSION=$(echo "$BODY" | jq -r '.session_id')

[ -n "$LK_TOKEN" ] && [ "$LK_TOKEN" != "null" ] && echo "PASS: LK-01 token" || echo "FAIL: LK-01 no token"
[ -n "$LK_ROOM" ] && [ "$LK_ROOM" != "null" ] && echo "PASS: LK-01 room_name" || echo "FAIL: LK-01 no room_name"
[ -n "$LK_URL" ] && [ "$LK_URL" != "null" ] && echo "PASS: LK-01 livekit_url" || echo "FAIL: LK-01 no livekit_url"
[ -n "$LK_VI_USER" ] && [ "$LK_VI_USER" != "null" ] && echo "PASS: LK-01 vi_user_id" || echo "FAIL: LK-01 no vi_user_id"
[ -n "$LK_SESSION" ] && [ "$LK_SESSION" != "null" ] && echo "PASS: LK-01 session_id" || echo "FAIL: LK-01 no session_id"

# Store for subsequent tests
export VI_USER_ID="$LK_VI_USER"
export SESSION_ID="$LK_SESSION"
```

---

#### LK-02: Same device_id returns same vi_user_id

| Field | Value |
|---|---|
| ID | LK-02 |
| Name | Repeated device_id yields same vi_user_id |
| Method | POST /api/livekit/anonymous |
| Auth | None |
| Depends on | LK-01 |

**Steps:**

```bash
BODY2=$(curl -s -X POST "$API_URL/api/livekit/anonymous" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\": \"$DEVICE_ID\"}")

LK_VI_USER_2=$(echo "$BODY2" | jq -r '.vi_user_id')
```

**Expected Result:**
- `vi_user_id` from second call equals `vi_user_id` from LK-01

**Validation:**

```bash
[ "$LK_VI_USER_2" = "$VI_USER_ID" ] && echo "PASS: LK-02 same vi_user_id" || echo "FAIL: LK-02 vi_user_id mismatch ($LK_VI_USER_2 != $VI_USER_ID)"
```

---

#### LK-03: Authenticated token creation

| Field | Value |
|---|---|
| ID | LK-03 |
| Name | JWT-authenticated token creation |
| Method | POST /api/livekit/token |
| Auth | Bearer $TOKEN |
| Depends on | AUTH-03 |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/livekit/token" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response contains `token`, `room_name`, `livekit_url`

**Validation:**

```bash
LK_AUTH_TOKEN=$(echo "$BODY" | jq -r '.token')
LK_AUTH_ROOM=$(echo "$BODY" | jq -r '.room_name')

[ -n "$LK_AUTH_TOKEN" ] && [ "$LK_AUTH_TOKEN" != "null" ] && echo "PASS: LK-03 token" || echo "FAIL: LK-03 no token"
[ -n "$LK_AUTH_ROOM" ] && [ "$LK_AUTH_ROOM" != "null" ] && echo "PASS: LK-03 room_name" || echo "FAIL: LK-03 no room_name"
```

---

#### LK-04: LiveKit token is valid JWT format

| Field | Value |
|---|---|
| ID | LK-04 |
| Name | Token has 3 dot-separated JWT parts |
| Method | Validation only |
| Auth | N/A |
| Depends on | LK-01 |

**Steps:**

```bash
# Use the token from LK-01
LK_TOKEN=$(curl -s -X POST "$API_URL/api/livekit/anonymous" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\": \"lk04-$DEVICE_ID\"}" | jq -r '.token')

# Count dot-separated parts
PARTS=$(echo "$LK_TOKEN" | tr '.' '\n' | wc -l | tr -d ' ')
```

**Expected Result:**
- Token contains exactly 3 dot-separated segments (header.payload.signature)

**Validation:**

```bash
[ "$PARTS" = "3" ] && echo "PASS: LK-04 valid JWT format ($PARTS parts)" || echo "FAIL: LK-04 invalid JWT ($PARTS parts)"
```

---

### Suite 4: SESSION — 会话管理 (10 tests)

> **Note:** Session tests use the internal API. The `VI_USER_ID` from LK-01 is used throughout.

#### SESS-01: Create session

| Field | Value |
|---|---|
| ID | SESS-01 |
| Name | Create session in "created" status |
| Method | POST /api/internal/sessions |
| Auth | None (internal) |
| Depends on | LK-01 (needs VI_USER_ID) |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"context\": {\"source\": \"e2e_test\", \"test_run\": \"$$\"}
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200` or `201`
- Response contains `id` (non-empty)
- `status` is `"created"`
- `vi_user_id` matches input

**Validation:**

```bash
SESS_ID=$(echo "$BODY" | jq -r '.id')
SESS_STATUS=$(echo "$BODY" | jq -r '.status')
SESS_USER=$(echo "$BODY" | jq -r '.vi_user_id')

[ -n "$SESS_ID" ] && [ "$SESS_ID" != "null" ] && echo "PASS: SESS-01 id present" || echo "FAIL: SESS-01 no id"
[ "$SESS_STATUS" = "created" ] && echo "PASS: SESS-01 status=created" || echo "FAIL: SESS-01 status=$SESS_STATUS"
[ "$SESS_USER" = "$VI_USER_ID" ] && echo "PASS: SESS-01 vi_user_id match" || echo "FAIL: SESS-01 vi_user_id mismatch"

# Store for subsequent tests
export TEST_SESSION_ID="$SESS_ID"
```

---

#### SESS-02: Dispatch session

| Field | Value |
|---|---|
| ID | SESS-02 |
| Name | Dispatch transitions to "dispatched" |
| Method | POST /api/internal/sessions/{id}/dispatch |
| Auth | None (internal) |
| Depends on | SESS-01 |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/internal/sessions/$TEST_SESSION_ID/dispatch" \
  -H "Content-Type: application/json" \
  -d "{
    \"executor\": \"e2e_test_agent\",
    \"prompt\": \"E2E test dispatch\",
    \"vi_user_id\": \"$VI_USER_ID\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- `status` is `"dispatched"`

**Validation:**

```bash
DISPATCH_STATUS=$(echo "$BODY" | jq -r '.status')
[ "$DISPATCH_STATUS" = "dispatched" ] && echo "PASS: SESS-02 dispatched" || echo "FAIL: SESS-02 status=$DISPATCH_STATUS"
```

---

#### SESS-03: Complete session

| Field | Value |
|---|---|
| ID | SESS-03 |
| Name | Complete transitions to "completed" |
| Method | POST /api/internal/sessions/{id}/complete |
| Auth | None (internal) |
| Depends on | SESS-02 |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/internal/sessions/$TEST_SESSION_ID/complete" \
  -H "Content-Type: application/json" \
  -d "{
    \"result\": \"E2E test completed successfully\",
    \"vi_user_id\": \"$VI_USER_ID\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- `status` is `"completed"`
- `result` contains the provided result string

**Validation:**

```bash
COMPLETE_STATUS=$(echo "$BODY" | jq -r '.status')
COMPLETE_RESULT=$(echo "$BODY" | jq -r '.result')

[ "$COMPLETE_STATUS" = "completed" ] && echo "PASS: SESS-03 completed" || echo "FAIL: SESS-03 status=$COMPLETE_STATUS"
[ "$COMPLETE_RESULT" = "E2E test completed successfully" ] && echo "PASS: SESS-03 result" || echo "FAIL: SESS-03 result mismatch"
```

---

#### SESS-04: Fail session

| Field | Value |
|---|---|
| ID | SESS-04 |
| Name | Fail transitions to "failed" with error |
| Method | POST /api/internal/sessions/{id}/fail |
| Auth | None (internal) |
| Depends on | SESS-01 (new session needed) |

**Steps:**

```bash
# Create a fresh session to test failure path
FRESH=$(curl -s -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\", \"context\": {\"test\": \"sess-04\"}}")

FAIL_SESS_ID=$(echo "$FRESH" | jq -r '.id')

# Dispatch it first (required state transition)
curl -s -X POST "$API_URL/api/internal/sessions/$FAIL_SESS_ID/dispatch" \
  -H "Content-Type: application/json" \
  -d "{\"executor\": \"e2e_test\", \"prompt\": \"test\", \"vi_user_id\": \"$VI_USER_ID\"}" > /dev/null

# Now fail it
BODY=$(curl -s -X POST "$API_URL/api/internal/sessions/$FAIL_SESS_ID/fail" \
  -H "Content-Type: application/json" \
  -d "{
    \"error\": \"E2E deliberate failure test\",
    \"vi_user_id\": \"$VI_USER_ID\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- `status` is `"failed"`
- `error` field contains the error message

**Validation:**

```bash
FAIL_STATUS=$(echo "$BODY" | jq -r '.status')
FAIL_ERROR=$(echo "$BODY" | jq -r '.error')

[ "$FAIL_STATUS" = "failed" ] && echo "PASS: SESS-04 failed" || echo "FAIL: SESS-04 status=$FAIL_STATUS"
[ "$FAIL_ERROR" = "E2E deliberate failure test" ] && echo "PASS: SESS-04 error msg" || echo "FAIL: SESS-04 error mismatch"
```

---

#### SESS-05: Get session by ID

| Field | Value |
|---|---|
| ID | SESS-05 |
| Name | GET full session data by ID |
| Method | GET /api/internal/sessions/{id} |
| Auth | None (internal) |
| Depends on | SESS-01 |

**Steps:**

```bash
BODY=$(curl -s -X GET "$API_URL/api/internal/sessions/$TEST_SESSION_ID")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response contains: `id`, `vi_user_id`, `status`, `context`, `created_at`
- `id` matches `$TEST_SESSION_ID`

**Validation:**

```bash
GET_ID=$(echo "$BODY" | jq -r '.id')
GET_STATUS=$(echo "$BODY" | jq -r '.status')
GET_USER=$(echo "$BODY" | jq -r '.vi_user_id')
GET_CREATED=$(echo "$BODY" | jq -r '.created_at')

[ "$GET_ID" = "$TEST_SESSION_ID" ] && echo "PASS: SESS-05 id match" || echo "FAIL: SESS-05 id mismatch"
[ -n "$GET_STATUS" ] && [ "$GET_STATUS" != "null" ] && echo "PASS: SESS-05 has status" || echo "FAIL: SESS-05 no status"
[ "$GET_USER" = "$VI_USER_ID" ] && echo "PASS: SESS-05 vi_user_id" || echo "FAIL: SESS-05 vi_user_id mismatch"
[ -n "$GET_CREATED" ] && [ "$GET_CREATED" != "null" ] && echo "PASS: SESS-05 created_at" || echo "FAIL: SESS-05 no created_at"
```

---

#### SESS-06: List sessions by user

| Field | Value |
|---|---|
| ID | SESS-06 |
| Name | List sessions for a vi_user_id |
| Method | GET /api/internal/sessions/by-user/{vi_user_id} |
| Auth | None (internal) |
| Depends on | SESS-01 |

**Steps:**

```bash
BODY=$(curl -s -X GET "$API_URL/api/internal/sessions/by-user/$VI_USER_ID?limit=50")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response is an array (or object with sessions array)
- Contains at least 1 session
- Sessions belong to `$VI_USER_ID`

**Validation:**

```bash
# Handle both array and object responses
if echo "$BODY" | jq -e 'type == "array"' > /dev/null 2>&1; then
  COUNT=$(echo "$BODY" | jq 'length')
  FIRST_USER=$(echo "$BODY" | jq -r '.[0].vi_user_id')
else
  COUNT=$(echo "$BODY" | jq '.sessions | length // .items | length // 0' 2>/dev/null || echo "0")
  FIRST_USER=$(echo "$BODY" | jq -r '.sessions[0].vi_user_id // .items[0].vi_user_id // empty' 2>/dev/null)
fi

[ "$COUNT" -ge 1 ] && echo "PASS: SESS-06 has sessions ($COUNT)" || echo "FAIL: SESS-06 no sessions"
[ "$FIRST_USER" = "$VI_USER_ID" ] && echo "PASS: SESS-06 user match" || echo "FAIL: SESS-06 user mismatch"
```

---

#### SESS-07: Partial session update

| Field | Value |
|---|---|
| ID | SESS-07 |
| Name | PATCH updates title, progress, artifacts |
| Method | PATCH /api/internal/sessions/{id} |
| Auth | None (internal) |
| Depends on | SESS-01 |

**Steps:**

```bash
BODY=$(curl -s -X PATCH "$API_URL/api/internal/sessions/$TEST_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"E2E Test Session Updated\",
    \"intention\": \"Testing partial update\",
    \"progress_step\": \"step_2_of_3\",
    \"artifacts\": [{\"type\": \"text\", \"content\": \"test artifact\"}]
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- `title` updated to `"E2E Test Session Updated"`
- `intention` updated
- `artifacts` array has 1 entry

**Validation:**

```bash
PATCH_TITLE=$(echo "$BODY" | jq -r '.title')
PATCH_INTENTION=$(echo "$BODY" | jq -r '.intention')

[ "$PATCH_TITLE" = "E2E Test Session Updated" ] && echo "PASS: SESS-07 title" || echo "FAIL: SESS-07 title=$PATCH_TITLE"
[ "$PATCH_INTENTION" = "Testing partial update" ] && echo "PASS: SESS-07 intention" || echo "FAIL: SESS-07 intention=$PATCH_INTENTION"
```

---

#### SESS-08: List sessions via user API (JWT)

| Field | Value |
|---|---|
| ID | SESS-08 |
| Name | GET /api/users/sessions with JWT returns paginated list |
| Method | GET /api/users/sessions |
| Auth | Bearer $TOKEN |
| Depends on | AUTH-03, SESS-01 |

**Steps:**

```bash
BODY=$(curl -s -X GET "$API_URL/api/users/sessions?skip=0&limit=20" \
  -H "Authorization: Bearer $TOKEN")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response is an array or paginated object
- Contains sessions for the authenticated user

**Validation:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/users/sessions?skip=0&limit=20" \
  -H "Authorization: Bearer $TOKEN")

[ "$HTTP_CODE" = "200" ] && echo "PASS: SESS-08 status" || echo "FAIL: SESS-08 status=$HTTP_CODE"
```

---

#### SESS-09: End session

| Field | Value |
|---|---|
| ID | SESS-09 |
| Name | End session sets ended_at |
| Method | PATCH /api/internal/sessions/{id}/end |
| Auth | None (internal) |
| Depends on | SESS-01 |

**Steps:**

```bash
# Create a fresh session for this test
END_SESS=$(curl -s -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\"}")
END_SESS_ID=$(echo "$END_SESS" | jq -r '.id')

BODY=$(curl -s -X PATCH "$API_URL/api/internal/sessions/$END_SESS_ID/end" \
  -H "Content-Type: application/json")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- `ended_at` field is set (non-null ISO timestamp)

**Validation:**

```bash
ENDED_AT=$(echo "$BODY" | jq -r '.ended_at')
[ -n "$ENDED_AT" ] && [ "$ENDED_AT" != "null" ] && echo "PASS: SESS-09 ended_at set" || echo "FAIL: SESS-09 ended_at not set"
```

---

#### SESS-10: State machine validation

| Field | Value |
|---|---|
| ID | SESS-10 |
| Name | Cannot skip states (e.g., created -> completed) |
| Method | POST /api/internal/sessions/{id}/complete |
| Auth | None (internal) |

**Steps:**

```bash
# Create a fresh session (status = "created")
FRESH=$(curl -s -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\"}")
SKIP_SESS_ID=$(echo "$FRESH" | jq -r '.id')

# Try to complete without dispatching first
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$API_URL/api/internal/sessions/$SKIP_SESS_ID/complete" \
  -H "Content-Type: application/json" \
  -d "{\"result\": \"skipping dispatch\"}")
```

**Expected Result:**
- HTTP status: `400` or `422` or `409` (state transition error)
- Should NOT be `200` — skipping states must be rejected

**Validation:**

```bash
if [ "$HTTP_CODE" = "200" ]; then
  echo "FAIL: SESS-10 allowed state skip (created -> completed)"
else
  echo "PASS: SESS-10 rejected state skip (HTTP $HTTP_CODE)"
fi
```

**Note:** If the server returns 200, this is a bug — the state machine should enforce valid transitions: `created -> dispatched -> completed/failed`.

---

### Suite 5: MEMORY — 记忆系统 (10 tests)

#### MEM-01: Upsert memory file (internal)

| Field | Value |
|---|---|
| ID | MEM-01 |
| Name | PUT memory file via internal API |
| Method | PUT /api/internal/memories/{filename} |
| Auth | None (internal) |
| Depends on | LK-01 (needs VI_USER_ID) |

**Steps:**

```bash
MEM_FILENAME="e2e_test_preference_$$.md"

BODY=$(curl -s -X PUT "$API_URL/api/internal/memories/$MEM_FILENAME" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"content\": \"# User Preferences\n\nLanguage: English\nTheme: Dark\nTest run: $$\",
    \"category\": \"preference\",
    \"source\": \"e2e_test\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200` or `201`
- Response confirms memory was created/updated

**Validation:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API_URL/api/internal/memories/$MEM_FILENAME" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"content\": \"# Test Memory\nContent: e2e\",
    \"category\": \"preference\",
    \"source\": \"e2e_test\"
  }")

[ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] && echo "PASS: MEM-01 upsert" || echo "FAIL: MEM-01 (HTTP $HTTP_CODE)"

export MEM_FILENAME
```

---

#### MEM-02: Append memory content

| Field | Value |
|---|---|
| ID | MEM-02 |
| Name | POST appends to memory |
| Method | POST /api/internal/memories |
| Auth | None (internal) |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/internal/memories" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"content\": \"Appended note: user prefers concise responses\",
    \"filename\": \"e2e_append_$$.md\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200` or `201`

**Validation:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/internal/memories" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"content\": \"Test append content\",
    \"filename\": \"e2e_append_$$.md\"
  }")

[ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] && echo "PASS: MEM-02 append" || echo "FAIL: MEM-02 (HTTP $HTTP_CODE)"
```

---

#### MEM-03: Batch upsert memories

| Field | Value |
|---|---|
| ID | MEM-03 |
| Name | Batch upsert multiple memory files |
| Method | POST /api/internal/memories/batch |
| Auth | None (internal) |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/internal/memories/batch" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"files\": [
      {\"filename\": \"e2e_batch_1_$$.md\", \"content\": \"Batch file 1: general info\", \"mode\": \"overwrite\"},
      {\"filename\": \"e2e_batch_2_$$.md\", \"content\": \"Batch file 2: session notes\", \"mode\": \"overwrite\"},
      {\"filename\": \"e2e_batch_3_$$.md\", \"content\": \"Batch file 3: preferences\", \"mode\": \"overwrite\"}
    ]
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- All 3 files processed successfully

**Validation:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/internal/memories/batch" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"files\": [
      {\"filename\": \"e2e_batch_verify_$$.md\", \"content\": \"verify\", \"mode\": \"overwrite\"}
    ]
  }")

[ "$HTTP_CODE" = "200" ] && echo "PASS: MEM-03 batch" || echo "FAIL: MEM-03 (HTTP $HTTP_CODE)"
```

---

#### MEM-04: Get aggregated memory context

| Field | Value |
|---|---|
| ID | MEM-04 |
| Name | Get memory context for user |
| Method | GET /api/internal/memories/context/{vi_user_id} |
| Auth | None (internal) |
| Depends on | MEM-01 |

**Steps:**

```bash
BODY=$(curl -s -X GET "$API_URL/api/internal/memories/context/$VI_USER_ID?max_chars=2000")

echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
```

**Expected Result:**
- HTTP status: `200`
- Response contains aggregated memory content
- Content includes text from previously created memories

**Validation:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/internal/memories/context/$VI_USER_ID?max_chars=2000")

[ "$HTTP_CODE" = "200" ] && echo "PASS: MEM-04 context" || echo "FAIL: MEM-04 (HTTP $HTTP_CODE)"
```

---

#### MEM-05: List memories by device (anonymous)

| Field | Value |
|---|---|
| ID | MEM-05 |
| Name | List memories via user API (anonymous) |
| Method | GET /api/users/memory/by-device |
| Auth | vi_user_id query param |
| Depends on | MEM-01 |

**Steps:**

```bash
BODY=$(curl -s -X GET "$API_URL/api/users/memory/by-device?vi_user_id=$VI_USER_ID")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response is array or object with memory entries
- Contains at least 1 memory file

**Validation:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/users/memory/by-device?vi_user_id=$VI_USER_ID")

[ "$HTTP_CODE" = "200" ] && echo "PASS: MEM-05 list" || echo "FAIL: MEM-05 (HTTP $HTTP_CODE)"
```

---

#### MEM-06: Get specific memory by device

| Field | Value |
|---|---|
| ID | MEM-06 |
| Name | Get single memory file (anonymous) |
| Method | GET /api/users/memory/by-device/{filename} |
| Auth | vi_user_id query param |
| Depends on | MEM-01 |

**Steps:**

```bash
BODY=$(curl -s -X GET "$API_URL/api/users/memory/by-device/$MEM_FILENAME?vi_user_id=$VI_USER_ID")

echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
```

**Expected Result:**
- HTTP status: `200`
- Response contains the memory content

**Validation:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/users/memory/by-device/$MEM_FILENAME?vi_user_id=$VI_USER_ID")

[ "$HTTP_CODE" = "200" ] && echo "PASS: MEM-06 get" || echo "FAIL: MEM-06 (HTTP $HTTP_CODE)"
```

---

#### MEM-07: Upsert memory by device (anonymous)

| Field | Value |
|---|---|
| ID | MEM-07 |
| Name | PUT memory via user API (anonymous) |
| Method | PUT /api/users/memory/by-device/{filename} |
| Auth | vi_user_id query param |

**Steps:**

```bash
ANON_MEM="e2e_anon_mem_$$.md"

BODY=$(curl -s -X PUT "$API_URL/api/users/memory/by-device/$ANON_MEM?vi_user_id=$VI_USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"Anonymous user memory content for E2E test $$\"}")

echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
```

**Expected Result:**
- HTTP status: `200` or `201`

**Validation:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "$API_URL/api/users/memory/by-device/$ANON_MEM?vi_user_id=$VI_USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"verify content\"}")

[ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] && echo "PASS: MEM-07 upsert" || echo "FAIL: MEM-07 (HTTP $HTTP_CODE)"

export ANON_MEM
```

---

#### MEM-08: Delete memory by device (anonymous)

| Field | Value |
|---|---|
| ID | MEM-08 |
| Name | DELETE memory via user API (anonymous) |
| Method | DELETE /api/users/memory/by-device/{filename} |
| Auth | vi_user_id query param |
| Depends on | MEM-07 |

**Steps:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API_URL/api/users/memory/by-device/$ANON_MEM?vi_user_id=$VI_USER_ID")
```

**Expected Result:**
- HTTP status: `200` or `204`

**Validation:**

```bash
[ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ] && echo "PASS: MEM-08 delete" || echo "FAIL: MEM-08 (HTTP $HTTP_CODE)"

# Verify deletion: subsequent GET should 404
VERIFY_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_URL/api/users/memory/by-device/$ANON_MEM?vi_user_id=$VI_USER_ID")

[ "$VERIFY_CODE" = "404" ] && echo "PASS: MEM-08 verified deleted" || echo "WARN: MEM-08 verify got $VERIFY_CODE (expected 404)"
```

---

#### MEM-09: Category auto-inference from filename

| Field | Value |
|---|---|
| ID | MEM-09 |
| Name | Category inferred from filename pattern |
| Method | PUT /api/internal/memories/{filename} |
| Auth | None (internal) |

**Steps:**

```bash
# Create memory with "preference" in filename — should auto-infer category
BODY=$(curl -s -X PUT "$API_URL/api/internal/memories/user_preference_$$.md" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"content\": \"Preferred language: English\"
  }")

echo "$BODY" | jq .

# Create memory with "session_summary" in filename
BODY2=$(curl -s -X PUT "$API_URL/api/internal/memories/session_summary_$$.md" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"content\": \"Session summary: discussed project architecture\"
  }")

echo "$BODY2" | jq .
```

**Expected Result:**
- HTTP status: `200` for both
- If server supports auto-inference, `category` field reflects filename pattern
- If not, this is informational (category defaults to "general")

**Validation:**

```bash
CAT1=$(echo "$BODY" | jq -r '.category // "not_returned"')
CAT2=$(echo "$BODY2" | jq -r '.category // "not_returned"')

echo "INFO: MEM-09 preference file category=$CAT1, session_summary category=$CAT2"
# This test is informational — pass if requests succeed
[ "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$API_URL/api/internal/memories/user_preference_verify_$$.md" \
  -H 'Content-Type: application/json' \
  -d "{\"vi_user_id\": \"$VI_USER_ID\", \"content\": \"test\"}")" = "200" ] && echo "PASS: MEM-09" || echo "FAIL: MEM-09"
```

---

#### MEM-10: Memory context priority ordering

| Field | Value |
|---|---|
| ID | MEM-10 |
| Name | Context returns memories in priority order |
| Method | GET /api/internal/memories/context/{vi_user_id} |
| Auth | None (internal) |
| Depends on | MEM-01, MEM-09 |

**Steps:**

```bash
# Create memories with different categories
curl -s -X PUT "$API_URL/api/internal/memories/pref_priority_$$.md" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\", \"content\": \"PRIORITY_PREF\", \"category\": \"preference\"}" > /dev/null

curl -s -X PUT "$API_URL/api/internal/memories/agent_priority_$$.md" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\", \"content\": \"PRIORITY_AGENT\", \"category\": \"agent\"}" > /dev/null

curl -s -X PUT "$API_URL/api/internal/memories/summary_priority_$$.md" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\", \"content\": \"PRIORITY_SUMMARY\", \"category\": \"session_summary\"}" > /dev/null

curl -s -X PUT "$API_URL/api/internal/memories/general_priority_$$.md" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\", \"content\": \"PRIORITY_GENERAL\", \"category\": \"general\"}" > /dev/null

# Retrieve context
CONTEXT=$(curl -s "$API_URL/api/internal/memories/context/$VI_USER_ID?max_chars=5000")

echo "$CONTEXT" | jq . 2>/dev/null || echo "$CONTEXT"
```

**Expected Result:**
- HTTP status: `200`
- Preference memories appear before agent, session_summary, and general
- Priority order: `preference > agent > session_summary > general`

**Validation:**

```bash
# Check that context contains our test markers
CONTEXT_TEXT=$(echo "$CONTEXT" | jq -r '.context // .content // .' 2>/dev/null || echo "$CONTEXT")

echo "$CONTEXT_TEXT" | grep -q "PRIORITY_PREF" && echo "PASS: MEM-10 preference included" || echo "WARN: MEM-10 preference not found"

# Verify priority ordering if response is structured
PREF_POS=$(echo "$CONTEXT_TEXT" | grep -n "PRIORITY_PREF" | head -1 | cut -d: -f1)
GENERAL_POS=$(echo "$CONTEXT_TEXT" | grep -n "PRIORITY_GENERAL" | head -1 | cut -d: -f1)

if [ -n "$PREF_POS" ] && [ -n "$GENERAL_POS" ]; then
  [ "$PREF_POS" -lt "$GENERAL_POS" ] && echo "PASS: MEM-10 preference before general" || echo "WARN: MEM-10 priority order unexpected"
else
  echo "INFO: MEM-10 could not verify ordering (markers not in text context)"
fi
```

---

### Suite 6: UPLOAD — 文件上传 (3 tests)

#### UPL-01: Get presigned URL for JPG

| Field | Value |
|---|---|
| ID | UPL-01 |
| Name | Presigned URL for JPG upload |
| Method | GET /api/upload/presign |
| Auth | None |

**Steps:**

```bash
BODY=$(curl -s -X GET "$API_URL/api/upload/presign?ext=jpg&size=1000000")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response contains presigned PUT URL and GET URL
- URLs contain S3 signature parameters

**Validation:**

```bash
PUT_URL=$(echo "$BODY" | jq -r '.put_url // .upload_url // .presigned_url // empty')
GET_URL=$(echo "$BODY" | jq -r '.get_url // .download_url // .public_url // empty')

[ -n "$PUT_URL" ] && echo "PASS: UPL-01 put_url present" || echo "FAIL: UPL-01 no put_url"
[ -n "$GET_URL" ] && echo "PASS: UPL-01 get_url present" || echo "FAIL: UPL-01 no get_url"
```

---

#### UPL-02: Validate presigned URL format

| Field | Value |
|---|---|
| ID | UPL-02 |
| Name | Presigned URL contains S3 signature |
| Method | Validation only |
| Depends on | UPL-01 |

**Steps:**

```bash
BODY=$(curl -s -X GET "$API_URL/api/upload/presign?ext=png&size=500000")

PUT_URL=$(echo "$BODY" | jq -r '.put_url // .upload_url // .presigned_url // empty')
```

**Expected Result:**
- URL contains `storage.googleapis.com` domain
- URL contains signature parameters (`X-Goog-Signature`)

**Validation:**

```bash
if echo "$PUT_URL" | grep -qi "storage.googleapis.com"; then
  echo "PASS: UPL-02 GCS domain"
else
  echo "WARN: UPL-02 no GCS domain in URL (may use custom domain)"
fi

if echo "$PUT_URL" | grep -qi "Signature\|X-Goog-"; then
  echo "PASS: UPL-02 signature present"
else
  echo "FAIL: UPL-02 no signature in URL"
fi
```

---

#### UPL-03: Invalid extension rejected

| Field | Value |
|---|---|
| ID | UPL-03 |
| Name | EXE extension returns 422 |
| Method | GET /api/upload/presign |
| Auth | None |

**Steps:**

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/upload/presign?ext=exe&size=1000000")
```

**Expected Result:**
- HTTP status: `422` (Unprocessable Entity) or `400` (Bad Request)

**Validation:**

```bash
if [ "$HTTP_CODE" = "422" ] || [ "$HTTP_CODE" = "400" ]; then
  echo "PASS: UPL-03 rejected exe (HTTP $HTTP_CODE)"
else
  echo "FAIL: UPL-03 expected 422/400 (got $HTTP_CODE)"
fi
```

---

### Suite 7: EVENTS — 事件流 (3 tests)

#### EVT-01: SSE stream opens successfully

| Field | Value |
|---|---|
| ID | EVT-01 |
| Name | SSE stream opens with 200 |
| Method | GET /api/users/events |
| Auth | vi_user_id query param |

**Steps:**

```bash
# Start SSE connection with 5-second timeout (enough to check if it opens)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  "$API_URL/api/users/events?vi_user_id=$VI_USER_ID" 2>/dev/null || true)

# For SSE, the connection may timeout (code 0 or 28) which is normal —
# we need to check the initial response code
SSE_RESPONSE=$(curl -s -D - --max-time 3 \
  "$API_URL/api/users/events?vi_user_id=$VI_USER_ID" 2>/dev/null || true)

SSE_STATUS=$(echo "$SSE_RESPONSE" | head -1 | grep -o '[0-9]\{3\}')
```

**Expected Result:**
- HTTP status: `200`
- Content-Type: `text/event-stream`

**Validation:**

```bash
[ "$SSE_STATUS" = "200" ] && echo "PASS: EVT-01 SSE opens" || echo "FAIL: EVT-01 (status=$SSE_STATUS)"

CONTENT_TYPE=$(echo "$SSE_RESPONSE" | grep -i "content-type" | head -1)
echo "$CONTENT_TYPE" | grep -qi "event-stream" && echo "PASS: EVT-01 content-type" || echo "WARN: EVT-01 content-type: $CONTENT_TYPE"
```

---

#### EVT-02: Heartbeat received within 30 seconds

| Field | Value |
|---|---|
| ID | EVT-02 |
| Name | Heartbeat event received |
| Method | GET /api/users/events |
| Auth | vi_user_id query param |

**Steps:**

```bash
# Listen for up to 35 seconds, capture output
SSE_DATA=$(timeout 35 curl -s -N \
  "$API_URL/api/users/events?vi_user_id=$VI_USER_ID" 2>/dev/null || true)
```

**Expected Result:**
- SSE stream contains a heartbeat event (`:` comment line, `event: heartbeat`, or `event: ping`)

**Validation:**

```bash
if echo "$SSE_DATA" | grep -qi "heartbeat\|ping\|: \|:ok"; then
  echo "PASS: EVT-02 heartbeat received"
else
  echo "FAIL: EVT-02 no heartbeat within 30s"
fi
```

**Note:** This test takes up to 35 seconds. Skip in fast-run mode if needed.

---

#### EVT-03: Session update event published

| Field | Value |
|---|---|
| ID | EVT-03 |
| Name | Session state change triggers event |
| Method | SSE + session mutation |
| Depends on | LK-01 |

**Steps:**

```bash
# Start SSE listener in background
SSE_OUTPUT="/tmp/e2e_sse_$$.log"
timeout 15 curl -s -N "$API_URL/api/users/events?vi_user_id=$VI_USER_ID" > "$SSE_OUTPUT" 2>/dev/null &
SSE_PID=$!

# Wait for SSE connection to establish
sleep 2

# Create a session (should trigger event)
curl -s -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\", \"context\": {\"test\": \"evt-03\"}}" > /dev/null

# Wait for event to propagate
sleep 3

# Kill SSE listener
kill $SSE_PID 2>/dev/null || true
wait $SSE_PID 2>/dev/null || true

# Check captured output
cat "$SSE_OUTPUT"
```

**Expected Result:**
- SSE output contains session-related event data

**Validation:**

```bash
if [ -s "$SSE_OUTPUT" ]; then
  echo "PASS: EVT-03 received SSE data"
  if grep -qi "session\|update\|created" "$SSE_OUTPUT"; then
    echo "PASS: EVT-03 session event detected"
  else
    echo "WARN: EVT-03 data received but no session event keyword found"
  fi
else
  echo "FAIL: EVT-03 no SSE data received"
fi

rm -f "$SSE_OUTPUT"
```

---

### Suite 8: INTERNAL-TASKS — 内部任务系统 (5 tests)

#### TASK-01: Create task

| Field | Value |
|---|---|
| ID | TASK-01 |
| Name | Create internal task |
| Method | POST /api/internal/tasks |
| Auth | None (internal) |

**Steps:**

```bash
BODY=$(curl -s -X POST "$API_URL/api/internal/tasks" \
  -H "Content-Type: application/json" \
  -d "{
    \"vi_user_id\": \"$VI_USER_ID\",
    \"prompt\": \"E2E test task: analyze test results\",
    \"context\": {\"source\": \"e2e_test\", \"run\": \"$$\"},
    \"session_id\": \"$TEST_SESSION_ID\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200` or `201`
- Response contains `id`
- `vi_user_id` matches input
- `status` is initial state (e.g., `"pending"` or `"created"`)

**Validation:**

```bash
TASK_ID=$(echo "$BODY" | jq -r '.id')
TASK_STATUS=$(echo "$BODY" | jq -r '.status')
TASK_USER=$(echo "$BODY" | jq -r '.vi_user_id')

[ -n "$TASK_ID" ] && [ "$TASK_ID" != "null" ] && echo "PASS: TASK-01 id present" || echo "FAIL: TASK-01 no id"
[ "$TASK_USER" = "$VI_USER_ID" ] && echo "PASS: TASK-01 vi_user_id" || echo "FAIL: TASK-01 vi_user_id mismatch"

export TASK_ID
```

---

#### TASK-02: Update task to "progress"

| Field | Value |
|---|---|
| ID | TASK-02 |
| Name | PATCH task status to progress |
| Method | PATCH /api/internal/tasks/{id} |
| Auth | None (internal) |
| Depends on | TASK-01 |

**Steps:**

```bash
BODY=$(curl -s -X PATCH "$API_URL/api/internal/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"status\": \"progress\",
    \"progress_step\": 1,
    \"progress_total\": 3,
    \"progress_message\": \"Analyzing data...\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- `status` updated to `"progress"`

**Validation:**

```bash
UPD_STATUS=$(echo "$BODY" | jq -r '.status')
[ "$UPD_STATUS" = "progress" ] && echo "PASS: TASK-02 progress" || echo "FAIL: TASK-02 status=$UPD_STATUS"
```

---

#### TASK-03: Complete task with result

| Field | Value |
|---|---|
| ID | TASK-03 |
| Name | PATCH task to complete with result |
| Method | PATCH /api/internal/tasks/{id} |
| Auth | None (internal) |
| Depends on | TASK-02 |

**Steps:**

```bash
BODY=$(curl -s -X PATCH "$API_URL/api/internal/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"status\": \"complete\",
    \"result\": \"Analysis complete: all metrics within normal range. E2E test $$.\",
    \"progress_step\": 3,
    \"progress_total\": 3,
    \"progress_message\": \"Done\"
  }")

echo "$BODY" | jq .
```

**Expected Result:**
- HTTP status: `200`
- `status` is `"complete"`
- `result` contains the provided result text

**Validation:**

```bash
COMP_STATUS=$(echo "$BODY" | jq -r '.status')
COMP_RESULT=$(echo "$BODY" | jq -r '.result')

[ "$COMP_STATUS" = "complete" ] && echo "PASS: TASK-03 complete" || echo "FAIL: TASK-03 status=$COMP_STATUS"
[ -n "$COMP_RESULT" ] && [ "$COMP_RESULT" != "null" ] && echo "PASS: TASK-03 result" || echo "FAIL: TASK-03 no result"
```

---

#### TASK-04: List tasks via user API (JWT)

| Field | Value |
|---|---|
| ID | TASK-04 |
| Name | GET /api/users/tasks with JWT |
| Method | GET /api/users/tasks |
| Auth | Bearer $TOKEN or vi_user_id |

**Steps:**

```bash
# Try JWT auth first
BODY=$(curl -s -X GET "$API_URL/api/users/tasks?skip=0&limit=20" \
  -H "Authorization: Bearer $TOKEN")

echo "$BODY" | jq .

# Also try by device
BODY_DEVICE=$(curl -s -X GET "$API_URL/api/users/tasks/by-device?vi_user_id=$VI_USER_ID&skip=0&limit=20")

echo "$BODY_DEVICE" | jq .
```

**Expected Result:**
- HTTP status: `200`
- Response is an array or paginated object
- Contains at least 1 task

**Validation:**

```bash
HTTP_JWT=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/users/tasks?skip=0&limit=20" \
  -H "Authorization: Bearer $TOKEN")
HTTP_DEVICE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/users/tasks/by-device?vi_user_id=$VI_USER_ID")

[ "$HTTP_JWT" = "200" ] && echo "PASS: TASK-04 JWT" || echo "WARN: TASK-04 JWT (HTTP $HTTP_JWT)"
[ "$HTTP_DEVICE" = "200" ] && echo "PASS: TASK-04 device" || echo "FAIL: TASK-04 device (HTTP $HTTP_DEVICE)"
```

---

#### TASK-05: Delete task

| Field | Value |
|---|---|
| ID | TASK-05 |
| Name | DELETE task via user API |
| Method | DELETE /api/users/tasks/{id} |
| Auth | Bearer $TOKEN or vi_user_id |
| Depends on | TASK-01 |

**Steps:**

```bash
# Create a disposable task
DISPOSABLE=$(curl -s -X POST "$API_URL/api/internal/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\", \"prompt\": \"disposable task $$\"}")
DISPOSABLE_ID=$(echo "$DISPOSABLE" | jq -r '.id')

# Delete via user API
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API_URL/api/users/tasks/$DISPOSABLE_ID" \
  -H "Authorization: Bearer $TOKEN")
```

**Expected Result:**
- HTTP status: `200` or `204`

**Validation:**

```bash
[ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ] && echo "PASS: TASK-05 delete" || echo "FAIL: TASK-05 (HTTP $HTTP_CODE)"
```

---

### Suite 9: LATENCY — SLA性能剖析 (8 metrics)

> Each latency test measures response time and compares against SLA targets.
> Uses `curl -w` for precise timing.

#### LAT-01: Health endpoint latency

| Field | Value |
|---|---|
| ID | LAT-01 |
| Metric | T_health |
| Endpoint | GET /health |
| SLA Target | < 100ms |

**Steps:**

```bash
TIME_MS=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/health" | awk '{printf "%.0f", $1 * 1000}')
```

**Validation:**

```bash
echo "LAT-01: T_health = ${TIME_MS}ms (SLA: <100ms)"
[ "$TIME_MS" -lt 100 ] && echo "PASS: LAT-01" || echo "FAIL: LAT-01 (${TIME_MS}ms > 100ms)"
```

---

#### LAT-02: Signup latency

| Field | Value |
|---|---|
| ID | LAT-02 |
| Metric | T_signup |
| Endpoint | POST /api/auth/signup |
| SLA Target | < 500ms |

**Steps:**

```bash
LAT_EMAIL="lat02_${$}_$(date +%s)@vitest.local"
TIME_MS=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$LAT_EMAIL\", \"password\": \"LatPass123\"}" | awk '{printf "%.0f", $1 * 1000}')
```

**Validation:**

```bash
echo "LAT-02: T_signup = ${TIME_MS}ms (SLA: <500ms)"
[ "$TIME_MS" -lt 500 ] && echo "PASS: LAT-02" || echo "FAIL: LAT-02 (${TIME_MS}ms > 500ms)"
```

---

#### LAT-03: Login latency

| Field | Value |
|---|---|
| ID | LAT-03 |
| Metric | T_login |
| Endpoint | POST /api/auth/login |
| SLA Target | < 500ms |

**Steps:**

```bash
TIME_MS=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\", \"password\": \"$TEST_PASSWORD\"}" | awk '{printf "%.0f", $1 * 1000}')
```

**Validation:**

```bash
echo "LAT-03: T_login = ${TIME_MS}ms (SLA: <500ms)"
[ "$TIME_MS" -lt 500 ] && echo "PASS: LAT-03" || echo "FAIL: LAT-03 (${TIME_MS}ms > 500ms)"
```

---

#### LAT-04: Anonymous token creation latency

| Field | Value |
|---|---|
| ID | LAT-04 |
| Metric | T_token_create |
| Endpoint | POST /api/livekit/anonymous |
| SLA Target | < 200ms |

**Steps:**

```bash
TIME_MS=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$API_URL/api/livekit/anonymous" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\": \"lat04-$DEVICE_ID\"}" | awk '{printf "%.0f", $1 * 1000}')
```

**Validation:**

```bash
echo "LAT-04: T_token_create = ${TIME_MS}ms (SLA: <200ms)"
[ "$TIME_MS" -lt 200 ] && echo "PASS: LAT-04" || echo "FAIL: LAT-04 (${TIME_MS}ms > 200ms)"
```

---

#### LAT-05: Session creation latency

| Field | Value |
|---|---|
| ID | LAT-05 |
| Metric | T_session_create |
| Endpoint | POST /api/internal/sessions |
| SLA Target | < 200ms |

**Steps:**

```bash
TIME_MS=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\"}" | awk '{printf "%.0f", $1 * 1000}')
```

**Validation:**

```bash
echo "LAT-05: T_session_create = ${TIME_MS}ms (SLA: <200ms)"
[ "$TIME_MS" -lt 200 ] && echo "PASS: LAT-05" || echo "FAIL: LAT-05 (${TIME_MS}ms > 200ms)"
```

---

#### LAT-06: Memory write latency

| Field | Value |
|---|---|
| ID | LAT-06 |
| Metric | T_memory_write |
| Endpoint | PUT /api/internal/memories/{filename} |
| SLA Target | < 500ms |

**Steps:**

```bash
TIME_MS=$(curl -s -o /dev/null -w "%{time_total}" -X PUT \
  "$API_URL/api/internal/memories/lat06_$$.md" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER_ID\", \"content\": \"latency test content\"}" | awk '{printf "%.0f", $1 * 1000}')
```

**Validation:**

```bash
echo "LAT-06: T_memory_write = ${TIME_MS}ms (SLA: <500ms)"
[ "$TIME_MS" -lt 500 ] && echo "PASS: LAT-06" || echo "FAIL: LAT-06 (${TIME_MS}ms > 500ms)"
```

---

#### LAT-07: Memory read latency

| Field | Value |
|---|---|
| ID | LAT-07 |
| Metric | T_memory_read |
| Endpoint | GET /api/internal/memories/context/{vi_user_id} |
| SLA Target | < 200ms |

**Steps:**

```bash
TIME_MS=$(curl -s -o /dev/null -w "%{time_total}" \
  "$API_URL/api/internal/memories/context/$VI_USER_ID?max_chars=2000" | awk '{printf "%.0f", $1 * 1000}')
```

**Validation:**

```bash
echo "LAT-07: T_memory_read = ${TIME_MS}ms (SLA: <200ms)"
[ "$TIME_MS" -lt 200 ] && echo "PASS: LAT-07" || echo "FAIL: LAT-07 (${TIME_MS}ms > 200ms)"
```

---

#### LAT-08: Presign URL latency

| Field | Value |
|---|---|
| ID | LAT-08 |
| Metric | T_presign |
| Endpoint | GET /api/upload/presign |
| SLA Target | < 300ms |

**Steps:**

```bash
TIME_MS=$(curl -s -o /dev/null -w "%{time_total}" \
  "$API_URL/api/upload/presign?ext=jpg&size=1000000" | awk '{printf "%.0f", $1 * 1000}')
```

**Validation:**

```bash
echo "LAT-08: T_presign = ${TIME_MS}ms (SLA: <300ms)"
[ "$TIME_MS" -lt 300 ] && echo "PASS: LAT-08" || echo "FAIL: LAT-08 (${TIME_MS}ms > 300ms)"
```

---

## 3. Performance Profiling / 性能剖析

### SLA Targets Table

| Metric | Endpoint | SLA Target | Priority |
|---|---|---|---|
| T_health | GET /health | < 100ms | P0 - Critical |
| T_signup | POST /api/auth/signup | < 500ms | P1 - High |
| T_login | POST /api/auth/login | < 500ms | P1 - High |
| T_token_create | POST /api/livekit/anonymous | < 200ms | P0 - Critical |
| T_session_create | POST /api/internal/sessions | < 200ms | P0 - Critical |
| T_memory_write | PUT /api/internal/memories/{fn} | < 500ms | P1 - High |
| T_memory_read | GET /api/internal/memories/context/{id} | < 200ms | P0 - Critical |
| T_presign | GET /api/upload/presign | < 300ms | P1 - High |

### How to Measure

Use `curl -w` with the `%{time_total}` variable:

```bash
# Single measurement
curl -s -o /dev/null -w "%{time_total}\n" "$API_URL/health"

# Multiple measurements (5 samples, calculate average)
for i in $(seq 1 5); do
  curl -s -o /dev/null -w "%{time_total}\n" "$API_URL/health"
done | awk '{sum += $1; count++} END {printf "Average: %.0f ms\n", (sum/count)*1000}'
```

### Latency Budget — Full User Flow

A typical user flow (open app -> start session -> interact -> end session) involves:

| Step | API Call | Budget |
|---|---|---|
| 1. App loads | GET /health | 100ms |
| 2. Get token | POST /api/livekit/anonymous | 200ms |
| 3. Session starts | POST /api/internal/sessions | 200ms |
| 4. Memory loaded | GET /api/internal/memories/context/{id} | 200ms |
| 5. Session ends | PATCH /api/internal/sessions/{id}/end | 200ms |
| **Total** | | **900ms** |

The total API latency budget for a full user flow should not exceed **1 second**.

---

## 4. QA Report Templates / QA报告模板

### JSON Report Schema

Save to `tests/reports/backend_e2e_report_YYYY-MM-DD.json`:

```json
{
  "meta": {
    "type": "backend",
    "date": "2026-02-28T00:00:00Z",
    "target_url": "http://YOUR_SERVER_IP:8000",
    "executor": "claude-code-agent",
    "duration_seconds": 0,
    "test_email": "e2e_test_XXXX@vitest.local",
    "vi_user_id": "vi_XXXX"
  },
  "summary": {
    "total": 53,
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "pass_rate": 0.0
  },
  "suites": [
    {
      "name": "HEALTH",
      "status": "passed",
      "tests": [
        {
          "id": "HEALTH-01",
          "name": "Health endpoint returns OK",
          "status": "passed",
          "duration_ms": 45,
          "details": "200 OK, status=ok"
        },
        {
          "id": "HEALTH-02",
          "name": "Swagger UI accessible",
          "status": "passed",
          "duration_ms": 120,
          "details": "200 OK"
        }
      ]
    },
    {
      "name": "AUTH",
      "status": "passed",
      "tests": [
        {
          "id": "AUTH-01",
          "name": "Signup creates new user",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "AUTH-02",
          "name": "Duplicate signup rejected",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "AUTH-03",
          "name": "Login with correct credentials",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "AUTH-04",
          "name": "Login with wrong password",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "AUTH-05",
          "name": "Login with nonexistent user",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "AUTH-06",
          "name": "Get profile with valid token",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "AUTH-07",
          "name": "Get profile without token",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "AUTH-08",
          "name": "Get profile with invalid token",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        }
      ]
    },
    {
      "name": "LIVEKIT",
      "status": "passed",
      "tests": [
        {
          "id": "LK-01",
          "name": "Anonymous token creation",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LK-02",
          "name": "Same device_id returns same vi_user_id",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LK-03",
          "name": "Authenticated token creation",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LK-04",
          "name": "LiveKit token is valid JWT format",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        }
      ]
    },
    {
      "name": "SESSION",
      "status": "passed",
      "tests": [
        {
          "id": "SESS-01",
          "name": "Create session",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "SESS-02",
          "name": "Dispatch session",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "SESS-03",
          "name": "Complete session",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "SESS-04",
          "name": "Fail session",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "SESS-05",
          "name": "Get session by ID",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "SESS-06",
          "name": "List sessions by user",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "SESS-07",
          "name": "Partial session update",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "SESS-08",
          "name": "List sessions via user API",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "SESS-09",
          "name": "End session",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "SESS-10",
          "name": "State machine validation",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        }
      ]
    },
    {
      "name": "MEMORY",
      "status": "passed",
      "tests": [
        {
          "id": "MEM-01",
          "name": "Upsert memory file",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "MEM-02",
          "name": "Append memory content",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "MEM-03",
          "name": "Batch upsert memories",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "MEM-04",
          "name": "Get aggregated memory context",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "MEM-05",
          "name": "List memories by device",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "MEM-06",
          "name": "Get specific memory by device",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "MEM-07",
          "name": "Upsert memory by device",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "MEM-08",
          "name": "Delete memory by device",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "MEM-09",
          "name": "Category auto-inference",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "MEM-10",
          "name": "Memory context priority ordering",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        }
      ]
    },
    {
      "name": "UPLOAD",
      "status": "passed",
      "tests": [
        {
          "id": "UPL-01",
          "name": "Get presigned URL for JPG",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "UPL-02",
          "name": "Validate presigned URL format",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "UPL-03",
          "name": "Invalid extension rejected",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        }
      ]
    },
    {
      "name": "EVENTS",
      "status": "passed",
      "tests": [
        {
          "id": "EVT-01",
          "name": "SSE stream opens",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "EVT-02",
          "name": "Heartbeat received",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "EVT-03",
          "name": "Session update event",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        }
      ]
    },
    {
      "name": "INTERNAL-TASKS",
      "status": "passed",
      "tests": [
        {
          "id": "TASK-01",
          "name": "Create task",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "TASK-02",
          "name": "Update task to progress",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "TASK-03",
          "name": "Complete task with result",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "TASK-04",
          "name": "List tasks via user API",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "TASK-05",
          "name": "Delete task",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        }
      ]
    },
    {
      "name": "LATENCY",
      "status": "passed",
      "tests": [
        {
          "id": "LAT-01",
          "name": "T_health < 100ms",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LAT-02",
          "name": "T_signup < 500ms",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LAT-03",
          "name": "T_login < 500ms",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LAT-04",
          "name": "T_token_create < 200ms",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LAT-05",
          "name": "T_session_create < 200ms",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LAT-06",
          "name": "T_memory_write < 500ms",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LAT-07",
          "name": "T_memory_read < 200ms",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        },
        {
          "id": "LAT-08",
          "name": "T_presign < 300ms",
          "status": "passed",
          "duration_ms": 0,
          "details": ""
        }
      ]
    }
  ],
  "performance": {
    "latencies": {
      "T_health": { "value_ms": 0, "sla_ms": 100, "pass": true },
      "T_signup": { "value_ms": 0, "sla_ms": 500, "pass": true },
      "T_login": { "value_ms": 0, "sla_ms": 500, "pass": true },
      "T_token_create": { "value_ms": 0, "sla_ms": 200, "pass": true },
      "T_session_create": { "value_ms": 0, "sla_ms": 200, "pass": true },
      "T_memory_write": { "value_ms": 0, "sla_ms": 500, "pass": true },
      "T_memory_read": { "value_ms": 0, "sla_ms": 200, "pass": true },
      "T_presign": { "value_ms": 0, "sla_ms": 300, "pass": true }
    }
  },
  "bugs": [
    {
      "id": "BUG-001",
      "severity": "high",
      "title": "Example: Session state machine allows state skip",
      "description": "POST /api/internal/sessions/{id}/complete succeeds on a session in 'created' status without dispatch",
      "reproduction": "1. Create session\n2. Call /complete directly\n3. Returns 200 instead of 400",
      "affected_suite": "SESSION",
      "affected_test": "SESS-10"
    }
  ]
}
```

### Markdown Report Template

Save to `tests/reports/backend_e2e_report_YYYY-MM-DD.md`:

```markdown
# VI-Agent Backend E2E Test Report

| Field | Value |
|---|---|
| Date | YYYY-MM-DD |
| Target | http://YOUR_SERVER_IP:8000 |
| Executor | claude-code-agent |
| Duration | Xs |
| Test User | e2e_test_XXXX@vitest.local |

## Summary

| Metric | Value |
|---|---|
| Total Tests | 53 |
| Passed | X |
| Failed | X |
| Skipped | X |
| Pass Rate | X% |

## Suite Results

### HEALTH (2/2 passed)
| ID | Test | Status | Time | Details |
|---|---|---|---|---|
| HEALTH-01 | Health endpoint | PASS | Xms | 200, status=ok |
| HEALTH-02 | Swagger UI | PASS | Xms | 200 |

### AUTH (X/8 passed)
| ID | Test | Status | Time | Details |
|---|---|---|---|---|
| AUTH-01 | Signup | PASS | Xms | |
| AUTH-02 | Duplicate signup | PASS | Xms | |
| AUTH-03 | Login | PASS | Xms | |
| AUTH-04 | Wrong password | PASS | Xms | |
| AUTH-05 | Nonexistent user | PASS | Xms | |
| AUTH-06 | Valid token /me | PASS | Xms | |
| AUTH-07 | No token /me | PASS | Xms | |
| AUTH-08 | Invalid token /me | PASS | Xms | |

### LIVEKIT (X/4 passed)
| ID | Test | Status | Time | Details |
|---|---|---|---|---|
| LK-01 | Anonymous token | PASS | Xms | |
| LK-02 | Same device_id | PASS | Xms | |
| LK-03 | JWT token | PASS | Xms | |
| LK-04 | JWT format | PASS | Xms | |

### SESSION (X/10 passed)
| ID | Test | Status | Time | Details |
|---|---|---|---|---|
| SESS-01 | Create | PASS | Xms | |
| SESS-02 | Dispatch | PASS | Xms | |
| SESS-03 | Complete | PASS | Xms | |
| SESS-04 | Fail | PASS | Xms | |
| SESS-05 | Get by ID | PASS | Xms | |
| SESS-06 | List by user | PASS | Xms | |
| SESS-07 | Partial update | PASS | Xms | |
| SESS-08 | User API list | PASS | Xms | |
| SESS-09 | End session | PASS | Xms | |
| SESS-10 | State machine | PASS | Xms | |

### MEMORY (X/10 passed)
| ID | Test | Status | Time | Details |
|---|---|---|---|---|
| MEM-01 | Upsert | PASS | Xms | |
| MEM-02 | Append | PASS | Xms | |
| MEM-03 | Batch | PASS | Xms | |
| MEM-04 | Context | PASS | Xms | |
| MEM-05 | List by device | PASS | Xms | |
| MEM-06 | Get by device | PASS | Xms | |
| MEM-07 | Upsert by device | PASS | Xms | |
| MEM-08 | Delete by device | PASS | Xms | |
| MEM-09 | Category inference | PASS | Xms | |
| MEM-10 | Priority ordering | PASS | Xms | |

### UPLOAD (X/3 passed)
| ID | Test | Status | Time | Details |
|---|---|---|---|---|
| UPL-01 | Presign JPG | PASS | Xms | |
| UPL-02 | URL format | PASS | Xms | |
| UPL-03 | Invalid ext | PASS | Xms | |

### EVENTS (X/3 passed)
| ID | Test | Status | Time | Details |
|---|---|---|---|---|
| EVT-01 | SSE opens | PASS | Xms | |
| EVT-02 | Heartbeat | PASS | Xms | |
| EVT-03 | Session event | PASS | Xms | |

### INTERNAL-TASKS (X/5 passed)
| ID | Test | Status | Time | Details |
|---|---|---|---|---|
| TASK-01 | Create | PASS | Xms | |
| TASK-02 | Progress | PASS | Xms | |
| TASK-03 | Complete | PASS | Xms | |
| TASK-04 | List | PASS | Xms | |
| TASK-05 | Delete | PASS | Xms | |

### LATENCY (X/8 passed)
| ID | Metric | Value | SLA | Status |
|---|---|---|---|---|
| LAT-01 | T_health | Xms | <100ms | PASS |
| LAT-02 | T_signup | Xms | <500ms | PASS |
| LAT-03 | T_login | Xms | <500ms | PASS |
| LAT-04 | T_token_create | Xms | <200ms | PASS |
| LAT-05 | T_session_create | Xms | <200ms | PASS |
| LAT-06 | T_memory_write | Xms | <500ms | PASS |
| LAT-07 | T_memory_read | Xms | <200ms | PASS |
| LAT-08 | T_presign | Xms | <300ms | PASS |

## Bugs Found

| ID | Severity | Title | Suite | Test |
|---|---|---|---|---|
| BUG-XXX | high | Description | SUITE | TEST-ID |

## Notes

- Add any observations, warnings, or recommendations here
```

---

## 5. Troubleshooting / 故障排除

### Common Failure Patterns

#### 1. Connection Refused

**Symptom:** `curl: (7) Failed to connect to YOUR_SERVER_IP port 8000`

**Diagnosis:**
```bash
# Check if server is reachable
curl -v --max-time 5 "$API_URL/health"

# Check DNS/network
ping -c 3 YOUR_SERVER_IP

# Check if port is open
nc -zv YOUR_SERVER_IP 8000
```

**Common Causes:**
- Server is down or restarting
- Security group does not allow port 8000
- Docker containers not running

---

#### 2. 500 Internal Server Error

**Symptom:** API returns HTTP 500 on valid requests

**Diagnosis:**
```bash
# Get error details
curl -s "$API_URL/health" | jq .

# Try a simple endpoint
curl -v "$API_URL/docs"
```

**Common Causes:**
- Database connection failure (PostgreSQL down)
- Redis connection failure
- Missing environment variables on server
- Unhandled exception in application code

---

#### 3. 422 Unprocessable Entity on Valid Payload

**Symptom:** Signup or session creation returns 422 with valid-looking JSON

**Diagnosis:**
```bash
# Check exact error details
curl -s -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"pass123"}' | jq .
```

**Common Causes:**
- Missing required fields (check API schema)
- Wrong Content-Type header (must be `application/json`)
- Password too short (may have minimum length)
- Invalid email format

---

#### 4. 401 on Valid Token

**Symptom:** `/me` returns 401 even with a token from login

**Diagnosis:**
```bash
# Verify token is non-empty
echo "Token: ${TOKEN:0:20}..."

# Check token format
echo "$TOKEN" | tr '.' '\n' | wc -l  # Should be 3

# Try re-login
curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" | jq .token
```

**Common Causes:**
- Token expired (JWT has short TTL)
- Token stored incorrectly (extra whitespace, newlines)
- Server secret changed since token was issued

---

#### 5. SSE Connection Hangs / No Events

**Symptom:** EVT tests timeout with no data

**Diagnosis:**
```bash
# Test basic SSE connection
curl -v -N --max-time 5 "$API_URL/api/users/events?vi_user_id=$VI_USER_ID"

# Check if Redis pub/sub is working (events depend on Redis)
curl -s "$API_URL/health" | jq .
```

**Common Causes:**
- Redis pub/sub not configured
- Events endpoint not implemented
- Proxy/load balancer buffering SSE responses
- `vi_user_id` has no active subscriptions

---

#### 6. Latency SLA Failures

**Symptom:** LAT tests fail with times exceeding SLA

**Diagnosis:**
```bash
# Run multiple samples to check if it's consistent
for i in $(seq 1 5); do
  curl -s -o /dev/null -w "%{time_total}\n" "$API_URL/health"
done

# Check network latency
ping -c 5 YOUR_SERVER_IP
```

**Common Causes:**
- Network latency from test runner location (test from closer region)
- Server under load
- Cold start (first request after idle period is slower)
- Database queries not optimized (missing indexes)

---

#### 7. Session State Machine Violations

**Symptom:** SESS-10 passes (allows state skip) when it should fail

**Assessment:** This is a **bug** — the backend should enforce state transitions. Document it in the bugs section of the report.

**Expected State Machine:**
```
created -> dispatched -> completed
created -> dispatched -> failed
```

---

#### 8. Memory Operations Return Empty

**Symptom:** MEM-04 returns 200 but no content

**Diagnosis:**
```bash
# Check if memories were actually written
curl -s "$API_URL/api/users/memory/by-device?vi_user_id=$VI_USER_ID" | jq .

# Try direct internal read
curl -s "$API_URL/api/internal/memories/context/$VI_USER_ID?max_chars=5000" | jq .
```

**Common Causes:**
- Memory was written for a different `vi_user_id`
- Database write succeeded but read uses different query
- `max_chars` limit too low

---

## 6. Execution Instructions for Agent / Agent执行指南

### Step-by-Step Execution Protocol

A Claude Code agent executing this test suite should follow these steps precisely:

#### Step 1: Environment Setup

```bash
# Set base URL
export API_URL="${VI_TEST_API_URL:-http://YOUR_SERVER_IP:8000}"

# Generate unique test identity
export TEST_EMAIL="e2e_test_${$}_$(date +%s)@vitest.local"
export TEST_PASSWORD="TestPass_${$}_$(date +%s)"
export TEST_DISPLAY_NAME="E2E Bot $$"
export DEVICE_ID="e2e-device-${$}-$(date +%s)"

# Initialize result variables
export TOKEN=""
export VI_USER_ID=""
export SESSION_ID=""
export TASK_ID=""
export TEST_SESSION_ID=""

# Create reports directory
mkdir -p tests/reports

# Record start time
export TEST_START=$(date +%s)

# Verify connectivity
curl -s --max-time 10 "$API_URL/health" | jq .
```

#### Step 2: Execute Test Suites Sequentially

Run suites in this order (each suite may depend on prior suites):

1. **HEALTH** — Verify server is running (2 tests)
2. **AUTH** — Create test user, get JWT (8 tests)
3. **LIVEKIT** — Get anonymous token, set VI_USER_ID (4 tests)
4. **SESSION** — Full session lifecycle (10 tests)
5. **MEMORY** — Memory CRUD and context (10 tests)
6. **UPLOAD** — Presigned URL generation (3 tests)
7. **EVENTS** — SSE stream validation (3 tests)
8. **INTERNAL-TASKS** — Task lifecycle (5 tests)
9. **LATENCY** — Performance profiling (8 metrics)

**For each test:**
1. Run the curl command
2. Check HTTP status code
3. Parse and validate response fields
4. Record result: PASS, FAIL, or SKIP
5. Record duration in milliseconds
6. If FAIL, record error details

#### Step 3: Collect Timing Data

For latency tests (Suite 9), use this pattern:

```bash
# Measure and store
T_HEALTH=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/health" | awk '{printf "%.0f", $1 * 1000}')
T_SIGNUP=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"lat_${$}@vitest.local\",\"password\":\"Pass123\"}" | awk '{printf "%.0f", $1 * 1000}')
# ... repeat for all LAT metrics
```

#### Step 4: Generate Reports

After all tests complete:

```bash
# Calculate duration
TEST_END=$(date +%s)
DURATION=$((TEST_END - TEST_START))

# Generate ISO date
REPORT_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
REPORT_FILE_DATE=$(date +"%Y-%m-%d")
```

Then produce both:
- `tests/reports/backend_e2e_report_${REPORT_FILE_DATE}.json` (using the JSON template above)
- `tests/reports/backend_e2e_report_${REPORT_FILE_DATE}.md` (using the MD template above)

Fill in all `0` and `X` placeholder values with actual measured results.

#### Step 5: Save Reports

```bash
# Ensure directory exists
mkdir -p tests/reports

# Write JSON report (use jq to format)
cat > tests/reports/backend_e2e_report_${REPORT_FILE_DATE}.json << 'JSONEOF'
{
  ... (filled in JSON)
}
JSONEOF

# Write MD report
cat > tests/reports/backend_e2e_report_${REPORT_FILE_DATE}.md << 'MDEOF'
... (filled in markdown)
MDEOF

echo "Reports saved to tests/reports/"
ls -la tests/reports/
```

#### Step 6: Summary Output

Print a final summary to the console:

```
============================================
 VI-Agent Backend E2E Test Complete
============================================
 Date:     YYYY-MM-DD
 Target:   http://YOUR_SERVER_IP:8000
 Duration: Xs

 HEALTH:         2/2  passed
 AUTH:            8/8  passed
 LIVEKIT:         4/4  passed
 SESSION:       10/10 passed
 MEMORY:        10/10 passed
 UPLOAD:          3/3  passed
 EVENTS:          3/3  passed
 INTERNAL-TASKS:  5/5  passed
 LATENCY:         8/8  passed
 ─────────────────────────────
 TOTAL:         53/53 passed (100%)

 Bugs found: 0
 Reports: tests/reports/backend_e2e_report_YYYY-MM-DD.{json,md}
============================================
```

### Important Notes for the Executing Agent

1. **Sequential execution is mandatory** — suites depend on each other (AUTH creates token used by LIVEKIT, etc.)
2. **Store all exported variables** between bash calls — `TOKEN`, `VI_USER_ID`, `TEST_SESSION_ID`, `TASK_ID`
3. **Handle flexible response formats** — some endpoints may return arrays or objects; use defensive jq parsing
4. **EVT-02 is slow** — the heartbeat test takes up to 35 seconds; do not skip it but note the time
5. **Record ALL results** — even PASS results need duration_ms for the latency section
6. **For failures**, capture the full response body as `details` in the report
7. **Do not stop on first failure** — run ALL tests and report all results
8. **Test isolation** — the PID-based email ensures no collision with other test runs
9. **Cleanup is not required** — test data is scoped to unique identifiers and can be left in place
10. **If the server is unreachable**, skip all tests and report the entire suite as SKIP with connection error details

---

## Appendix: Test ID Quick Reference / 测试ID速查

| ID | Suite | Name | Method |
|---|---|---|---|
| HEALTH-01 | HEALTH | Health OK | GET /health |
| HEALTH-02 | HEALTH | Swagger UI | GET /docs |
| AUTH-01 | AUTH | Signup | POST /api/auth/signup |
| AUTH-02 | AUTH | Duplicate signup | POST /api/auth/signup |
| AUTH-03 | AUTH | Login | POST /api/auth/login |
| AUTH-04 | AUTH | Wrong password | POST /api/auth/login |
| AUTH-05 | AUTH | Nonexistent user | POST /api/auth/login |
| AUTH-06 | AUTH | Valid token /me | GET /api/auth/me |
| AUTH-07 | AUTH | No token /me | GET /api/auth/me |
| AUTH-08 | AUTH | Invalid token /me | GET /api/auth/me |
| LK-01 | LIVEKIT | Anonymous token | POST /api/livekit/anonymous |
| LK-02 | LIVEKIT | Same device_id | POST /api/livekit/anonymous |
| LK-03 | LIVEKIT | JWT token | POST /api/livekit/token |
| LK-04 | LIVEKIT | JWT format | Validation |
| SESS-01 | SESSION | Create | POST /api/internal/sessions |
| SESS-02 | SESSION | Dispatch | POST /api/internal/sessions/{id}/dispatch |
| SESS-03 | SESSION | Complete | POST /api/internal/sessions/{id}/complete |
| SESS-04 | SESSION | Fail | POST /api/internal/sessions/{id}/fail |
| SESS-05 | SESSION | Get by ID | GET /api/internal/sessions/{id} |
| SESS-06 | SESSION | List by user | GET /api/internal/sessions/by-user/{id} |
| SESS-07 | SESSION | Partial update | PATCH /api/internal/sessions/{id} |
| SESS-08 | SESSION | User API list | GET /api/users/sessions |
| SESS-09 | SESSION | End session | PATCH /api/internal/sessions/{id}/end |
| SESS-10 | SESSION | State machine | POST /api/internal/sessions/{id}/complete |
| MEM-01 | MEMORY | Upsert | PUT /api/internal/memories/{fn} |
| MEM-02 | MEMORY | Append | POST /api/internal/memories |
| MEM-03 | MEMORY | Batch | POST /api/internal/memories/batch |
| MEM-04 | MEMORY | Context | GET /api/internal/memories/context/{id} |
| MEM-05 | MEMORY | List by device | GET /api/users/memory/by-device |
| MEM-06 | MEMORY | Get by device | GET /api/users/memory/by-device/{fn} |
| MEM-07 | MEMORY | Upsert by device | PUT /api/users/memory/by-device/{fn} |
| MEM-08 | MEMORY | Delete by device | DELETE /api/users/memory/by-device/{fn} |
| MEM-09 | MEMORY | Category inference | PUT /api/internal/memories/{fn} |
| MEM-10 | MEMORY | Priority ordering | GET /api/internal/memories/context/{id} |
| UPL-01 | UPLOAD | Presign JPG | GET /api/upload/presign |
| UPL-02 | UPLOAD | URL format | Validation |
| UPL-03 | UPLOAD | Invalid ext | GET /api/upload/presign |
| EVT-01 | EVENTS | SSE opens | GET /api/users/events |
| EVT-02 | EVENTS | Heartbeat | GET /api/users/events |
| EVT-03 | EVENTS | Session event | SSE + POST |
| TASK-01 | TASKS | Create | POST /api/internal/tasks |
| TASK-02 | TASKS | Progress | PATCH /api/internal/tasks/{id} |
| TASK-03 | TASKS | Complete | PATCH /api/internal/tasks/{id} |
| TASK-04 | TASKS | List | GET /api/users/tasks |
| TASK-05 | TASKS | Delete | DELETE /api/users/tasks/{id} |
| LAT-01 | LATENCY | T_health | GET /health |
| LAT-02 | LATENCY | T_signup | POST /api/auth/signup |
| LAT-03 | LATENCY | T_login | POST /api/auth/login |
| LAT-04 | LATENCY | T_token_create | POST /api/livekit/anonymous |
| LAT-05 | LATENCY | T_session_create | POST /api/internal/sessions |
| LAT-06 | LATENCY | T_memory_write | PUT /api/internal/memories/{fn} |
| LAT-07 | LATENCY | T_memory_read | GET /api/internal/memories/context/{id} |
| LAT-08 | LATENCY | T_presign | GET /api/upload/presign |
