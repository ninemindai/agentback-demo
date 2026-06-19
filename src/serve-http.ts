// Serves the weather MCP server over the MCP Streamable HTTP transport at
// POST/GET/DELETE /mcp, hardened with API-key auth + per-(caller,tool) rate
// limiting. Run with `npm run serve:http`.
//
// This is the remote-transport counterpart to the stdio entry point (main.ts):
// same tools, same DI wiring (src/wiring.ts), different transport. Point a
// remote MCP client at http://host:<port>/mcp and send an `x-api-key` header.
//
// API keys come from the MCP_API_KEYS env var (comma-separated). If unset, a
// single dev key is generated and printed to stderr so local runs still work —
// but the endpoint is never unauthenticated.
//
// The app is assembled by `buildHttpApp()` (exported, not started) so tests can
// exercise the auth + rate-limit gate without spawning a process; the CLI entry
// at the bottom (guarded by `isMain`) builds, starts, and reports.
import {isMain} from '@agentback/core';
import {RestApplication} from '@agentback/rest';
import {installMcpHttp, type McpToolRateLimitOptions} from '@agentback/mcp-http';
import {
  ApiKeyAuthenticationStrategy,
  API_KEY_VERIFIER,
  AuthenticationBindings,
} from '@agentback/authentication';
import {securityId} from '@agentback/security';
import {registerWeatherMcp, WEATHER_OPENAPI_SPEC} from './wiring.js';

// --- API keys → principals (each key grants the `mcp:tools` scope) -----------
export type Principal = {[securityId]: string; name: string; scopes: string[]};

export function loadKeys(): Record<string, Principal> {
  const raw = (process.env.MCP_API_KEYS ?? '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  if (raw.length === 0) {
    const dev = 'dev-local-key';
    process.stderr.write(
      `[serve:http] MCP_API_KEYS unset — using dev key "${dev}". ` +
        `Set MCP_API_KEYS=key1,key2 before exposing this server.\n`,
    );
    raw.push(dev);
  }

  const keys: Record<string, Principal> = {};
  for (const key of raw) {
    keys[key] = {
      [securityId]: `client:${key.slice(0, 6)}`,
      name: 'api-key client',
      scopes: ['mcp:tools'],
    };
  }
  return keys;
}

// Default throttle: 60 tools/call per minute per caller, with get_forecast (the
// heaviest call, up to 16 days) capped tighter at 20/min.
const DEFAULT_RATE_LIMIT: McpToolRateLimitOptions = {
  points: 60,
  durationSecs: 60,
  perTool: {get_forecast: {points: 20, durationSecs: 60}},
};

export interface HttpAppOptions {
  /** API key → principal map. Defaults to {@link loadKeys} (MCP_API_KEYS env). */
  keys?: Record<string, Principal>;
  /** REST server port. Default 3000. Pass 0 for an ephemeral port (tests). */
  port?: number;
  /** Bind host. Default unset (all interfaces); tests pass `127.0.0.1`. */
  host?: string;
  /** Per-(caller,tool) throttle. Defaults to 60/min, get_forecast 20/min. */
  rateLimit?: McpToolRateLimitOptions;
}

/**
 * Build (but do NOT start) the HTTP MCP app: same tools and DI wiring as the
 * stdio server, hardened with api-key auth + per-(caller,tool) rate limiting.
 */
export async function buildHttpApp(
  options: HttpAppOptions = {},
): Promise<RestApplication> {
  const keys = options.keys ?? loadKeys();

  const app = new RestApplication({
    rest: {
      port: options.port ?? 3000,
      ...(options.host ? {host: options.host} : {}),
      // Brand /openapi.json as weather-mcp instead of the framework default.
      openApiSpec: WEATHER_OPENAPI_SPEC,
    },
  });

  // stdio:false — HTTP is the transport here; the MCP server is driven per
  // request by the HTTP layer, not over stdin.
  registerWeatherMcp(app, false);

  // Register the api-key strategy: it reads `x-api-key` (or `?apiKey`) and
  // delegates to the verifier bound at API_KEY_VERIFIER. Unknown key → 401.
  app.bind(API_KEY_VERIFIER).to((key: string) => keys[key]);
  app
    .bind('strategies.apiKey')
    .toClass(ApiKeyAuthenticationStrategy)
    .tag(AuthenticationBindings.AUTH_STRATEGY);

  // Mounts POST/GET/DELETE /mcp. `strategyAuth` requires a valid key on every
  // request; `rateLimit` throttles tools/call per (caller, tool) — keyed by the
  // authenticated principal, not IP. Must be called before app.start().
  await installMcpHttp(app, {
    strategyAuth: {strategy: 'api-key'}, // required: true by default → 401 without a key
    rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
  });

  return app;
}

// --- CLI entry ---------------------------------------------------------------
if (isMain(import.meta)) {
  const port = Number(process.env.PORT ?? 3000);
  const keys = loadKeys();
  const app = await buildHttpApp({port, keys});
  await app.start();
  console.error(`weather-mcp (HTTP) on http://localhost:${port}/mcp`);
  console.error(
    `[serve:http] accepting ${Object.keys(keys).length} API key(s) via the x-api-key header`,
  );
}
