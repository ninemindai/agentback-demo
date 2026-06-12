import {Binding, BindingScope, type Component} from '@agentback/core';
import {MCPComponent} from '@agentback/mcp';
import {WeatherService} from './weather-service.js';
import {WeatherTools} from './tools/weather.tools.js';
import {WEATHER_SERVICE} from './keys.js';

/**
 * The weather feature packaged as a Component — its static DI contributions in
 * one manifest: the MCP runtime, the tool controller, and the service binding.
 * Per-transport config (stdio vs HTTP) is dynamic, so it stays at the entry
 * point (see `wiring.ts`).
 */
export class WeatherComponent implements Component {
  components = [MCPComponent];

  // A controller (not a service) so the MCP dispatcher resolves it via
  // `controllers.<name>` — the binding that honors constructor `@inject`.
  controllers = [WeatherTools];

  // Singleton: the Open-Meteo client is stateless (pure I/O), so one shared
  // instance is reused for every tool resolution rather than re-created.
  bindings = [
    Binding.bind(WEATHER_SERVICE)
      .toClass(WeatherService)
      .inScope(BindingScope.SINGLETON),
  ];
}
