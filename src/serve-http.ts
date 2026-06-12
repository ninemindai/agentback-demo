// Serves the weather MCP server over the MCP Streamable HTTP transport at
// POST/GET/DELETE /mcp. Run with `npm run serve:http`.
//
// This is the remote-transport counterpart to the stdio entry point (main.ts):
// same tools, same DI wiring (src/wiring.ts), different transport. Point a
// remote MCP client at http://host:<port>/mcp.
//
// NOTE: this minimal server is unauthenticated. Before exposing it publicly,
// pass `strategyAuth` / `auth`, `rateLimit`, and `allowedHosts`/`allowedOrigins`
// to installMcpHttp — see the @agentback/mcp-http docs.
import {RestApplication} from '@agentback/rest';
import {installMcpHttp} from '@agentback/mcp-http';
import {registerWeatherMcp} from './wiring.js';

const port = Number(process.env.PORT ?? 3000);

const app = new RestApplication();
// The RestServer reads its port via @config() on its own binding (the
// constructor `{rest:{port}}` option is not wired through in this version).
app.configure('servers.RestServer').to({port});

// stdio:false — HTTP is the transport here; the MCP server is driven per
// request by the HTTP layer, not over stdin.
registerWeatherMcp(app, false);

// Mounts POST/GET/DELETE /mcp on the RestApplication's Express app. Must be
// called before app.start(); throws if MCPComponent isn't mounted.
await installMcpHttp(app);

await app.start();
console.error(`weather-mcp (HTTP) on http://localhost:${port}/mcp`);
