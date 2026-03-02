#!/bin/bash
# Post-deployment test suite for dev instances
# Usage: ./test-instance.sh <server_ip> <frontend_port> <api_port> <gateway_port> [frontend_https_port]
#
# Runs 3-4 layers of tests:
#   Layer 1: Smoke — services reachable
#   Layer 2: Functional — core API works
#   Layer 3: Connectivity — service-to-service communication
#   Layer 4: HTTPS — SSL/TLS and secure context (if https port provided)
#
# Exit code: 0 if all pass, 1 if any fail
set -o pipefail

SERVER_IP="$1"
F_PORT="$2"
A_PORT="$3"
G_PORT="$4"
HTTPS_PORT="${5:-}"

if [ -z "$G_PORT" ]; then
    echo "Usage: $0 <server_ip> <frontend_port> <api_port> <gateway_port> [frontend_https_port]"
    exit 1
fi

PASS=0
FAIL=0
TOTAL=0

check() {
    local name="$1"
    shift
    TOTAL=$((TOTAL+1))
    if "$@" > /dev/null 2>&1; then
        echo "  ✅ $name"
        PASS=$((PASS+1))
    else
        echo "  ❌ $name"
        FAIL=$((FAIL+1))
    fi
}

# Helper: HTTP status check
http_ok() {
    local code
    code=$(curl -sf -o /dev/null -w '%{http_code}' --max-time 10 "$1")
    [ "$code" = "200" ] || [ "$code" = "201" ] || [ "$code" = "307" ]
}

echo "=== Layer 1: Smoke Test ==="

check "Frontend HTTP 200" http_ok "http://$SERVER_IP:$F_PORT/"

check "Frontend returns HTML" \
    bash -c "curl -sf --max-time 10 http://$SERVER_IP:$F_PORT/ | grep -q '</html>'"

check "API /health" \
    curl -sf --max-time 10 "http://$SERVER_IP:$A_PORT/health"

check "API /docs reachable" http_ok "http://$SERVER_IP:$A_PORT/docs"

check "Gateway /health" \
    curl -sf --max-time 10 "http://$SERVER_IP:$G_PORT/health"

check "API /api/config returns JSON" \
    bash -c "curl -sf --max-time 10 http://$SERVER_IP:$A_PORT/api/config | python3 -c 'import json,sys; json.load(sys.stdin)'"

echo ""
echo "=== Layer 2: Functional Test ==="

# Generate unique test user to avoid collision
TEST_EMAIL="smoke_$(date +%s)@test.dev"
TEST_PASS="test1234test"

# Signup
REG_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -X POST "http://$SERVER_IP:$A_PORT/api/auth/signup" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}")
check "API signup (status=$REG_CODE)" \
    bash -c "[ '$REG_CODE' = '200' ] || [ '$REG_CODE' = '201' ]"

# Login and extract token
TOKEN=$(curl -sf --max-time 10 \
    -X POST "http://$SERVER_IP:$A_PORT/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" | \
    python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('access_token','') or d.get('token',''))" 2>/dev/null)

check "API login returns JWT" test -n "$TOKEN"

if [ -n "$TOKEN" ]; then
    check "API /auth/me with JWT" \
        curl -sf --max-time 10 \
            -H "Authorization: Bearer $TOKEN" \
            "http://$SERVER_IP:$A_PORT/api/auth/me"
fi

echo ""
echo "=== Layer 3: Connectivity Test ==="

check "Frontend→API proxy (/health via nginx)" \
    bash -c "curl -sf --max-time 10 http://$SERVER_IP:$F_PORT/health | grep -qE '(ok|healthy|status)'"

check "Frontend→API proxy (/api/config via nginx)" \
    bash -c "curl -sf --max-time 10 http://$SERVER_IP:$F_PORT/api/config | python3 -c 'import json,sys; json.load(sys.stdin)'"

# CORS check
CORS_HEADER=$(curl -sI --max-time 10 \
    -X OPTIONS "http://$SERVER_IP:$A_PORT/api/health" \
    -H "Origin: http://$SERVER_IP:$F_PORT" \
    -H "Access-Control-Request-Method: GET" 2>/dev/null | grep -i "access-control")
check "CORS headers present" test -n "$CORS_HEADER"

# Layer 4: HTTPS (only if HTTPS port provided)
if [ -n "$HTTPS_PORT" ]; then
    echo ""
    echo "=== Layer 4: HTTPS Test ==="

    check "Frontend HTTPS reachable" \
        curl -skf --max-time 10 "https://$SERVER_IP:$HTTPS_PORT/"

    check "Frontend HTTPS returns HTML" \
        bash -c "curl -sk --max-time 10 https://$SERVER_IP:$HTTPS_PORT/ | grep -q '</html>'"

    check "Frontend HTTPS→API proxy (/api/config)" \
        bash -c "curl -sk --max-time 10 https://$SERVER_IP:$HTTPS_PORT/api/config | python3 -c 'import json,sys; json.load(sys.stdin)'"

    check "SSL certificate present" \
        bash -c "echo | openssl s_client -connect $SERVER_IP:$HTTPS_PORT 2>/dev/null | grep -q 'BEGIN CERTIFICATE'"
fi

echo ""
echo "==============================="
echo "  Results: $PASS/$TOTAL passed, $FAIL failed"
echo "==============================="

if [ "$FAIL" -eq 0 ]; then
    echo "  ✅ All tests passed"
    exit 0
else
    echo "  ⚠️  $FAIL test(s) failed"
    exit 1
fi
