/**
 * NanoClaw environment configuration.
 * All values sourced from environment variables with sensible dev defaults.
 */

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  // Redis
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379/0'),

  // Anthropic
  anthropicApiKey: required('ANTHROPIC_API_KEY'),

  // User identity
  userId: optional('USER_ID', 'dev-user'),

  // Filesystem paths
  userDataDir: optional('USER_DATA_DIR', '/workspace'),
  sharedSkillsDir: optional('SHARED_SKILLS_DIR', '/skills'),
  packagesDir: optional('PACKAGES_DIR', '/packages'),

  // API Server (for token lookups, etc.)
  apiServerUrl: optional('API_SERVER_URL', 'http://localhost:8000'),

  // Internal API auth token
  internalApiToken: optional('INTERNAL_API_TOKEN', 'vi-internal-dev-token'),

  // Health endpoint
  healthPort: parseInt(optional('HEALTH_PORT', '3100'), 10),

  // Context compiler interval (ms)
  contextIntervalMs: parseInt(optional('CONTEXT_INTERVAL_MS', '30000'), 10),

  // Models
  intentionModel: optional('INTENTION_MODEL', 'claude-haiku-4-5-20251001'),
  executorModel: optional('EXECUTOR_MODEL', 'claude-sonnet-4-20250514'),

  // Dashboard
  dashboardEnabled: optional('DASHBOARD', 'false') === 'true',

  // Container execution mode (v5.2) — default: true
  containerMode: optional('CONTAINER_MODE', 'true') === 'true',
  agentContainerImage: optional('AGENT_CONTAINER_IMAGE', 'nanoclaw-agent:latest'),
} as const;
