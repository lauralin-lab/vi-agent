import { config } from '../config.js';

/**
 * Make an authenticated API call using stored OAuth tokens.
 * Fetches token from API Server's Token Center, then makes the call.
 */
export async function oauthCall(
  provider: string,
  endpoint: string,
  options: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  // Get token from API Server
  const tokenRes = await fetch(
    `${config.apiServerUrl}/api/tokens/${provider}/status`,
    { headers: { 'X-Internal-Token': config.internalApiToken } },
  );

  if (!tokenRes.ok) {
    throw new Error(`OAuth token not available for provider: ${provider}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error(`No access token for provider: ${provider}`);
  }

  // Make the authenticated call
  const res = await fetch(endpoint, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`OAuth API call failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
