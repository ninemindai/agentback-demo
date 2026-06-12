// Dev console: serves the AgentBack console (MCP inspector + OpenAPI explorer +
// DI context explorer) over HTTP at /console. Run with `npm run console`.
//
// This is a development tool, not the production server — the stdio entry point
// (main.ts) is what you wire into Claude Desktop / Cursor.
import {RestApplication} from '@agentback/rest';
import {installConsole} from '@agentback/console';
import {registerWeatherMcp} from './wiring.js';

const port = Number(process.env.PORT ?? 3000);

const app = new RestApplication();
// The RestServer reads its port via @config() on its own binding — configure
// the server binding directly (the constructor `{rest:{port}}` option is not
// wired through in this version).
app.configure('servers.RestServer').to({port});

// stdio:false — the console introspects the MCP server in-process; we don't
// want it grabbing stdin while an HTTP server is running.
registerWeatherMcp(app, false);

await installConsole(app, {
  title: 'weather-mcp console',
  // Local-development only. In production, pass `auth` middleware instead — the
  // console exposes DI internals and can trigger outbound MCP connections.
  unsafeAllowUnauthenticated: true,
});

await app.start();
console.error(`weather-mcp console: http://localhost:${port}/console`);
