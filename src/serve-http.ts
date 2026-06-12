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
import {RestApplication} from '@agentback/rest';
import {installMcpHttp} from '@agentback/mcp-http';
import {
  ApiKeyAuthenticationStrategy,
  API_KEY_VERIFIER,
  AuthenticationBindings,
} from '@agentback/authentication';
import {securityId} from '@agentback/security';
import {registerWeatherMcp} from './wiring.js';

const port = Number(process.env.PORT ?? 3000);

// --- API keys → principals (each key grants the `mcp:tools` scope) -----------
type Principal = {[securityId]: string; name: string; scopes: string[]};

function loadKeys(): Record<string, Principal> {
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
    keys[key] = {[securityId]: `client:${key.slice(0, 6)}`, name: 'api-key client', scopes: ['mcp:tools']};
  }
  return keys;
}

const KEYS = loadKeys();

// --- App wiring --------------------------------------------------------------
const app = new RestApplication();
// The RestServer reads its port via @config() on its own binding (the
// constructor `{rest:{port}}` option is not wired through in this version).
app.configure('servers.RestServer').to({port});

// stdio:false — HTTP is the transport here; the MCP server is driven per
// request by the HTTP layer, not over stdin.
registerWeatherMcp(app, false);

// Register the api-key strategy: it reads `x-api-key` (or `?apiKey`) and
// delegates to the verifier bound at API_KEY_VERIFIER. Unknown key → 401.
app.bind(API_KEY_VERIFIER).to((key: string) => KEYS[key]);
app
  .bind('strategies.apiKey')
  .toClass(ApiKeyAuthenticationStrategy)
  .tag(AuthenticationBindings.AUTH_STRATEGY);

// Mounts POST/GET/DELETE /mcp. `strategyAuth` requires a valid key on every
// request; `rateLimit` throttles tools/call per (caller, tool) — keyed by the
// authenticated principal, not IP. Must be called before app.start().
await installMcpHttp(app, {
  strategyAuth: {strategy: 'api-key'}, // required: true by default → 401 without a key
  rateLimit: {
    points: 60, // 60 calls/min for any tool, per caller
    durationSecs: 60,
    perTool: {
      // Forecast is the heaviest call (up to 16 days) — throttle it tighter.
      get_forecast: {points: 20, durationSecs: 60},
    },
  },
});

await app.start();
console.error(`weather-mcp (HTTP) on http://localhost:${port}/mcp`);
console.error(`[serve:http] accepting ${Object.keys(KEYS).length} API key(s) via the x-api-key header`);
