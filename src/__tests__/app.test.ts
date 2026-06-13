import {describe, expect, it} from 'vitest';
import {createTestApp} from '@agentback/testing';
import {Application} from '../application.js';

/**
 * Exercises the MCP surface the way a real client sees it: `createTestApp`
 * boots the app and connects an in-memory MCP SDK client (`t.mcp`), so these
 * run the same `listTools` / `callTool` path a remote client would — full Zod
 * validation + dispatch, no network or transport process.
 *
 * Note the client contract differs from the in-process server API: a failed
 * tool call resolves with `isError: true` and a machine-actionable error
 * envelope, rather than throwing — the same envelope REST emits.
 */
type ToolContent = Array<{type: string; text: string}>;

describe('weather-mcp', () => {
  it('registers the three weather tools', async () => {
    await using t = await createTestApp(() => new Application({stdio: false}));
    const names = (await t.mcp.listTools()).tools.map(x => x.name).sort();
    expect(names).toEqual([
      'geocode_location',
      'get_current_weather',
      'get_forecast',
    ]);
  });

  it('advertises the city/coordinates selector on get_current_weather', async () => {
    await using t = await createTestApp(() => new Application({stdio: false}));
    const tool = (await t.mcp.listTools()).tools.find(
      x => x.name === 'get_current_weather',
    );
    expect(tool).toBeDefined();
    const keys = Object.keys(tool!.inputSchema.properties ?? {});
    expect(keys).toEqual(
      expect.arrayContaining(['city', 'latitude', 'longitude']),
    );
  });

  it('rejects a current-weather call with neither city nor coordinates', async () => {
    await using t = await createTestApp(() => new Application({stdio: false}));
    const res = await t.mcp.callTool({
      name: 'get_current_weather',
      arguments: {},
    });
    expect(res.isError).toBe(true);
    // The client sees a structured error envelope. NOTE: the location guidance
    // ("give a city or coordinates") is currently redacted to a generic
    // `internal_error` because `WeatherService.resolveLocation` throws a plain
    // `WeatherError` rather than a recognized client (4xx) error — so the
    // self-correction hint never reaches a real caller. See Framework Signal #7.
    const envelope = JSON.parse((res.content as ToolContent)[0].text) as {
      error?: {code?: string};
    };
    expect(envelope.error?.code).toBeDefined();
  });

  it('rejects unknown input fields (schema is strict)', async () => {
    await using t = await createTestApp(() => new Application({stdio: false}));
    const res = await t.mcp.callTool({
      name: 'geocode_location',
      arguments: {query: 'Tokyo', nope: 1},
    });
    expect(res.isError).toBe(true);
  });
});
