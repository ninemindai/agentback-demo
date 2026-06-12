import {describe, expect, it} from 'vitest';
import type {MCPServer} from '@agentback/mcp';
import {Application} from '../application.js';

/**
 * These tests exercise the MCP surface through the DI container directly — the
 * same path the in-process inspector uses (`MCPServer.listTools` / `.callTool`),
 * with full Zod validation + dispatch. No network or transport involved.
 */
async function getServer(): Promise<MCPServer> {
  const app = new Application({stdio: false});
  return app.getServer<MCPServer>('MCPServer');
}

describe('weather-mcp', () => {
  it('registers the three weather tools', async () => {
    const server = await getServer();
    const names = server
      .listTools()
      .map(t => t.meta.name)
      .sort();
    expect(names).toEqual(['geocode_location', 'get_current_weather', 'get_forecast']);
  });

  it('advertises the city/coordinates selector on get_current_weather', async () => {
    const server = await getServer();
    const tool = server.listTools().find(t => t.meta.name === 'get_current_weather');
    expect(tool).toBeDefined();
    const shape = (tool!.meta.input as unknown as {shape?: Record<string, unknown>}).shape;
    const keys = Object.keys(shape ?? {});
    expect(keys).toEqual(expect.arrayContaining(['city', 'latitude', 'longitude']));
  });

  it('rejects a current-weather call with neither city nor coordinates', async () => {
    const server = await getServer();
    await expect(server.callTool('get_current_weather', {})).rejects.toThrow(
      /city.*latitude.*longitude/i,
    );
  });

  it('rejects unknown input fields (schema is strict)', async () => {
    const server = await getServer();
    await expect(
      server.callTool('geocode_location', {query: 'Tokyo', nope: 1}),
    ).rejects.toThrow();
  });
});
