import {Binding, type Component} from '@agentback/core';
import {MCPComponent} from '@agentback/mcp';
import {FILE_STORE, InMemoryFileStore} from '@agentback/files';
import {WeatherService} from './weather-service.js';
import {WeatherTools} from './tools/weather.tools.js';
import {ObservationsService} from './observations-service.js';
import {ObservationsTools} from './tools/observations.tools.js';

/**
 * The weather feature packaged as a Component — its static DI contributions in
 * one manifest: the MCP runtime, the tool classes, the services they depend on,
 * and a FileStore for uploaded observations. Per-transport config (stdio vs
 * HTTP) is dynamic, so it stays at the entry point (see `wiring.ts`); the REST
 * upload controller mounts only on the HTTP surfaces (see `console.ts`).
 */
export class WeatherComponent implements Component {
  components = [MCPComponent];

  // `@mcpServer()` makes the tool classes extensions of the MCP_SERVERS
  // extension point (discovered + resolved through their bindings, honoring
  // constructor `@inject`). The services carry their own key + singleton scope
  // via `@injectable`.
  services = [WeatherTools, WeatherService, ObservationsTools, ObservationsService];

  // Backs file uploads. In production swap for S3FileStore (@agentback/files-s3)
  // — the controller, tool, and service don't change.
  bindings = [Binding.bind(FILE_STORE.key).to(new InMemoryFileStore())];
}
