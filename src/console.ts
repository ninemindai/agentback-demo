// Dev console: serves the AgentBack console (MCP inspector + OpenAPI explorer +
// DI context explorer + schema explorer) over HTTP at /console.
//
//   npm run console            — long-running server (binds a port)
//   api/index.ts (Vercel)      — serverless; calls buildConsoleApp({listen:false})
//
// This is a development/showcase tool, not the production server — the stdio
// entry point (main.ts) is what you wire into Claude Desktop / Cursor.
import {RestApplication} from '@agentback/rest';
import {installConsole} from '@agentback/console';
import {isMain} from '@agentback/core';
import {registerWeatherMcp, WEATHER_OPENAPI_SPEC} from './wiring.js';

/**
 * Build and start the console app. Shared by the CLI entry (below) and the
 * Vercel serverless handler (`api/index.ts`).
 *
 * `listen: false` makes `app.start()` mount every route but bind no TCP port —
 * the serverless platform owns the listener and drives the returned app's
 * `expressApp` directly. Default `true` is the normal long-running server.
 */
export async function buildConsoleApp(opts: {listen?: boolean} = {}) {
  // PORT (when bound) is resolved by RestApplication from the env automatically.
  const app = new RestApplication({
    rest: {listen: opts.listen ?? true, openApiSpec: WEATHER_OPENAPI_SPEC},
  });

  // stdio:false — the console introspects the MCP server in-process; we don't
  // want it grabbing stdin while an HTTP server is running.
  registerWeatherMcp(app, false);

  await installConsole(app, {
    title: 'weather-mcp console',
    // Public showcase with no secrets. In production, pass `auth` middleware
    // instead — the console exposes DI internals and outbound MCP connections.
    unsafeAllowUnauthenticated: true,
  });

  await app.start();
  return app;
}

if (isMain(import.meta)) {
  const app = await buildConsoleApp();
  const server = await app.restServer;
  console.error(`weather-mcp console: ${server.url}/console`);
}
