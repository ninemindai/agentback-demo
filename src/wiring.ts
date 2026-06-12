import type {Application as CoreApplication} from '@agentback/core';
import {MCPComponent} from '@agentback/mcp';
import {WeatherService} from './weather-service.js';
import {WeatherTools} from './tools/weather.tools.js';

/**
 * Register the weather MCP surface onto any AgentBack application — works for
 * both the stdio `Application` and the HTTP `RestApplication` used by the
 * console, since both extend the core `Application` (a `Context`).
 *
 * @param stdio - connect the stdio transport at start(). False for HTTP/console
 *   use, where the MCP server is still introspected in-process by the inspector.
 */
export function registerWeatherMcp(app: CoreApplication, stdio: boolean): void {
  app.component(MCPComponent);
  app.configure('servers.MCPServer').to({
    name: 'weather-mcp',
    version: '0.1.0',
    transports: {stdio},
  });

  // Bind the Open-Meteo client so the tool class can @inject it.
  app.bind('services.weather').toClass(WeatherService);

  // Register the tool class as a controller (not a service): the MCP server
  // instantiates tool classes via `controllers.<name>`, which is the binding
  // that resolves constructor `@inject`. The `@mcpServer()` tag is preserved,
  // so the server still discovers it by tag.
  app.controller(WeatherTools);
}
