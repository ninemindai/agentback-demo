import {Application as CoreApplication} from '@agentback/core';
import {MCPComponent} from '@agentback/mcp';
import {WeatherService} from './weather-service.js';
import {WeatherTools} from './tools/weather.tools.js';

export class Application extends CoreApplication {
  constructor(options: {stdio?: boolean} = {}) {
    super();
    this.component(MCPComponent);
    this.configure('servers.MCPServer').to({
      name: 'weather-mcp',
      version: '0.1.0',
      transports: {stdio: options.stdio ?? true},
    });

    // Bind the Open-Meteo client so the tool class can @inject it.
    this.bind('services.weather').toClass(WeatherService);

    // Register the tool class as a controller (not a service): the MCP server
    // instantiates tool classes via `controllers.<name>`, which is the binding
    // that resolves constructor `@inject`. The `@mcpServer()` tag is preserved,
    // so the server still discovers it by tag.
    this.controller(WeatherTools);
  }
}
