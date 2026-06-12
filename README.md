# weather-mcp

An MCP server built on [AgentBack](https://agentback.dev) that exposes weather
data from the free [Open-Meteo](https://open-meteo.com) API — **no API key
required**. Decorator-driven tools with Zod input/output schemas over stdio.

```bash
npm install
npm run build && npm start      # stdio MCP server
npm test                        # in-memory MCP session, no process spawn
npm run console                 # dev web UI at http://localhost:3000/console
```

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
