"""
VI-Agent E2E Testing Configuration
====================================
Shared configuration for agent-driven E2E tests.

Test Documents:
  - tests/e2e/backend_e2e_test.md  — Cloud backend module E2E
  - tests/e2e/browser_e2e_test.md  — Browser frontend+backend E2E

QA Reports Output:
  - tests/reports/qa-{type}-{date}.json  — Structured JSON
  - tests/reports/qa-{type}-{date}.md    — Human-readable summary
"""

import os

# ---------------------------------------------------------------------------
# Cloud Endpoints (configurable via environment variables)
# ---------------------------------------------------------------------------
# NOTE: Update these IPs when the cloud instance changes, or set via environment variables.
CLOUD_BASE_URL = os.getenv("VI_TEST_BASE_URL", "http://localhost")
CLOUD_API_URL = os.getenv("VI_TEST_API_URL", "http://localhost:8000")

# ---------------------------------------------------------------------------
# Test credentials (disposable, PID-based for isolation)
# ---------------------------------------------------------------------------
TEST_EMAIL = f"ci-test-{os.getpid()}@vi-agent.test"
TEST_PASSWORD = "TestPass!2026"
TEST_DISPLAY_NAME = "CI Test User"
