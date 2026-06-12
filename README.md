# weather-mcp

An MCP server built on [AgentBack](https://agentback.dev) that exposes weather
data from the free [Open-Meteo](https://open-meteo.com) API — **no API key
required**. Decorator-driven tools with Zod input/output schemas over stdio.

```bash
npm install
npm run build && npm start      # stdio MCP server (for Claude Desktop / Cursor)
npm run serve:http              # remote MCP server over HTTP at /mcp
npm test                        # in-memory MCP session, no process spawn
npm run console                 # dev web UI at http://localhost:3000/console
```

## Transports

The same tools and DI wiring (`src/wiring.ts`) are served three ways:

| Entry | Command | Transport | Use |
| ----- | ------- | --------- | --- |
| `src/main.ts` | `npm start` | stdio | Local — wire into Claude Desktop / Cursor. |
| `src/serve-http.ts` | `npm run serve:http` | Streamable HTTP at `POST/GET/DELETE /mcp` | Remote clients over the network. |
| `src/console.ts` | `npm run console` | HTTP web UI | Development inspector (see below). |

### HTTP transport

`npm run serve:http` exposes the server at `http://localhost:3000/mcp`
(`PORT=3939 npm run serve:http` to change the port). Point any Streamable-HTTP
MCP client at that URL.

**Auth:** every request needs a valid API key in the `x-api-key` header (or
`?apiKey=`). Keys come from `MCP_API_KEYS` (comma-separated); if unset, a
`dev-local-key` is generated and printed to stderr so local runs still work.

```bash
MCP_API_KEYS=key1,key2 PORT=3939 npm run serve:http
# client must send:  x-api-key: key1
```

**Rate limiting:** `tools/call` is throttled per (caller, tool) — 60/min by
default, with `get_forecast` capped tighter at 20/min. Over the limit returns a
JSON-RPC 429 with `Retry-After`. Both are configured in `src/serve-http.ts`.

> For public deployment also set `allowedHosts`/`allowedOrigins` on
> `installMcpHttp` (DNS-rebinding protection), and consider a Redis `store` for
> the rate limiter so buckets are shared across instances.

## Dev console

`npm run console` starts the [AgentBack console](https://agentback.dev) — a web
UI that composes the **MCP inspector** (list and invoke your tools from a form),
the **OpenAPI/Swagger explorer**, and a **DI context explorer**. Override the
port with `PORT=3737 npm run console`.

The console serves over HTTP, so it runs a `RestApplication` (`src/console.ts`)
that reuses the exact same tool wiring as the stdio server (`src/wiring.ts`).
It's a development tool — the stdio entry point (`src/main.ts`) is what you wire
into Claude Desktop / Cursor.

## Tools

| Tool                  | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `geocode_location`    | Resolve a place name (e.g. "Tokyo") to candidate latitude/longitude.    |
| `get_current_weather` | Current conditions by `city` name **or** `latitude`+`longitude`.        |
| `get_forecast`        | Daily forecast (1–16 days) by `city` **or** `latitude`+`longitude`.     |

Each tool accepts `temperature_unit` (`celsius`/`fahrenheit`) and
`wind_speed_unit` (`kmh`/`ms`/`mph`/`kn`). When you pass a `city`, it is
geocoded automatically; pass coordinates directly to skip that step.

## How it's wired

- **`src/schemas.ts`** — the single source of truth. Each Zod schema is
  simultaneously the runtime validator, the `z.infer` type, and the
  agent-visible MCP input/output schema.
- **`src/weather-service.ts`** — `WeatherService`, a stateless Open-Meteo client
  (geocoding + current/forecast), bound in DI as `services.weather`.
- **`src/tools/weather.tools.ts`** — `@mcpServer()`-tagged tool class; each
  `@tool` carries its input/output schema and delegates to the injected service.
- **`src/application.ts`** — mounts `MCPComponent`, binds the service, and
  registers the tool class with `app.controller(...)` so the MCP dispatcher
  resolves it **with constructor injection** (a class registered via
  `app.service(...)` is instantiated with `new` and would not get the injected
  service).

## Claude Desktop / Cursor config

```json
{
  "mcpServers": {
    "weather-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/weather-mcp/dist/main.js"]
    }
  }
}
```
