import type {Application as CoreApplication} from '@agentback/core';
import {WeatherComponent} from './component.js';

/**
 * Register the weather MCP surface onto any AgentBack application — works for
 * both the stdio `Application` and the HTTP `RestApplication` used by the
 * console, since both extend the core `Application` (a `Context`).
 *
 * The static DI contributions live in {@link WeatherComponent}; here we add it
 * and apply the per-entry transport config — the only part that varies.
 *
 * @param stdio - connect the stdio transport at start(). False for HTTP/console
 *   use, where the MCP server is still introspected in-process by the inspector.
 */
export function registerWeatherMcp(app: CoreApplication, stdio: boolean): void {
  app.component(WeatherComponent);
  app.configure('servers.MCPServer').to({
    name: 'weather-mcp',
    version: '0.1.0',
    transports: {stdio},
  });
}
