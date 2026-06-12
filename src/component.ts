import type {Component} from '@agentback/core';
import {MCPComponent} from '@agentback/mcp';
import {WeatherService} from './weather-service.js';
import {WeatherTools} from './tools/weather.tools.js';

/**
 * The weather feature packaged as a Component — its static DI contributions in
 * one manifest: the MCP runtime, the tool class, and the service it depends on.
 * Per-transport config (stdio vs HTTP) is dynamic, so it stays at the entry
 * point (see `wiring.ts`).
 */
export class WeatherComponent implements Component {
  components = [MCPComponent];

  // Both are plain DI services. `@mcpServer()` makes WeatherTools an extension
  // of the MCP_SERVERS extension point, so the MCP server discovers it and
  // resolves it through this binding — constructor `@inject` of WeatherService
  // is honored. WeatherService carries its own key + singleton scope via
  // `@injectable`.
  services = [WeatherTools, WeatherService];
}
