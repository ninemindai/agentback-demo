import type {Component} from '@agentback/core';
import {MCPComponent} from '@agentback/mcp';
import {WeatherService} from './weather-service.js';
import {WeatherTools} from './tools/weather.tools.js';

/**
 * The weather feature packaged as a Component — its static DI contributions in
 * one manifest: the MCP runtime, the tool controller, and the service.
 * Per-transport config (stdio vs HTTP) is dynamic, so it stays at the entry
 * point (see `wiring.ts`).
 */
export class WeatherComponent implements Component {
  components = [MCPComponent];

  // A controller (not a service) so the MCP dispatcher resolves it via
  // `controllers.<name>` — the binding that honors constructor `@inject`.
  controllers = [WeatherTools];

  // WeatherService carries its own key + singleton scope via `@injectable`;
  // listing it here registers it (createServiceBinding reads that metadata).
  services = [WeatherService];
}
