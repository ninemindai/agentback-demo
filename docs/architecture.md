# Architecture

`weather-mcp` is one deployable service (~600 LOC) that exposes Open-Meteo
weather data as MCP tools, served three ways from a single DI wiring. The code
is organized into five layers with dependencies flowing strictly **downward**:
Transports → Composition → Adapter → Domain → Contracts.

> A polished, exportable version of this diagram lives at
> [`docs/architecture-diagram.html`](./architecture-diagram.html) — open it in a
> browser (PNG/PDF export built in).

## Module dependency graph

```mermaid
graph TD
  subgraph Transports
    main["main.ts (stdio)"]
    serveHttp["serve-http.ts (HTTP + auth + rate-limit)"]
    console["console.ts (dev console)"]
  end

  subgraph Composition
    application["application.ts"]
    wiring["wiring.ts"]
    component["component.ts"]
    keys["keys.ts"]
  end

  subgraph Adapter
    tools["tools/weather.tools.ts (@mcpServer)"]
  end

  subgraph Domain
    service["weather-service.ts"]
  end

  subgraph Contracts
    schemas["schemas.ts (Zod SSOT)"]
  end

  main --> application
  application --> wiring
  serveHttp --> wiring
  console --> wiring
  wiring --> component
  component --> tools
  component --> service
  tools --> service
  tools --> keys
  tools --> schemas
  service --> keys
  service --> schemas
  keys -.->|type-only| service

  classDef warning fill:#ffd43b,stroke:#e67700
  classDef clean fill:#51cf66,stroke:#2b8a3e,color:#fff

  class service warning
  class main,serveHttp,console,application,wiring,component,keys,tools,schemas clean
```

Dependencies flow strictly downward. No runtime cycles. `wiring.ts` and
`schemas.ts` are the deliberate convergence points — three transports share one
wiring path, and the service + tools share one schema source. That
centralization is the design thesis, not a blast-radius defect.

## Layers

| Layer | File(s) | Responsibility |
| ----- | ------- | -------------- |
| **Transports** | `main.ts`, `serve-http.ts`, `console.ts` | Three entry points (stdio / Streamable HTTP / dev console). Each adapts a runtime to the shared wiring; `serve-http.ts` adds API-key auth + per-(caller, tool) rate limiting. |
| **Composition** | `application.ts`, `wiring.ts`, `component.ts`, `keys.ts` | The composition root. `wiring.ts` (`registerWeatherMcp`) is the single assembly path all transports call; `component.ts` packages the DI contributions; `keys.ts` holds typed `BindingKey`s. |
| **Adapter** | `tools/weather.tools.ts` | The `@mcpServer()` tool class — an extension of the `MCP_SERVERS` extension point. Each `@tool` carries its Zod I/O schemas and delegates to the injected `WeatherService`. |
| **Domain** | `weather-service.ts` | Stateless `@injectable` singleton: the Open-Meteo client. WMO-code translation, unit fallback, and response shaping live here. |
| **Contracts** | `schemas.ts` | The Zod single source of truth — each schema is simultaneously the runtime validator, the `z.infer` type, and the agent-visible MCP schema. (`keys.ts` is the DI counterpart.) |

## Runtime flow

1. An **MCP client** (Claude Desktop / Cursor over stdio, a remote client over
   HTTP, or the dev console) connects through a **transport**.
2. The transport hands off to the shared **wiring** (`registerWeatherMcp`),
   which has registered `WeatherComponent` — exposing `WeatherTools` as an
   `MCP_SERVERS` extension and binding `WeatherService`.
3. A `tools/call` resolves to a `@tool` on **`weather.tools.ts`**, which
   validates input against the **Zod schema** and **delegates** to the injected
   `WeatherService`.
4. **`weather-service.ts`** calls the **Open-Meteo API** over HTTPS, shapes the
   response, and validates the output against the schema on the way back.

## Known structural note

`weather-service.ts` performs all network I/O through a module-level `getJson()`
that calls global `fetch` directly — there is no fine-grained injection seam at
the Open-Meteo boundary, so the service's logic can't be unit-tested without a
live call. The coarse seam (overriding the whole `WEATHER_SERVICE` binding via
`createTestApp({overrides})`) exists; the fine one does not. See
[`brooks-lint-audit.md`](../brooks-lint-audit.md) for the full assessment.
