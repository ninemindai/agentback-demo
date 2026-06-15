// Copyright ninemind.ai and LoopBack contributors. All Rights Reserved.
// Node module: weather-mcp-server
// This file is licensed under the MIT License.

// REST weather routes (so the browser UI can fetch forecasts without MCP).
// These tests stay offline: the no-location request is rejected by the service
// BEFORE any Open-Meteo call, and the OpenAPI check is local.
import {describe, expect, it} from 'vitest';
import {createTestApp} from '@agentback/testing';
import {RestApplication} from '@agentback/rest';
import {registerWeatherMcp} from '../wiring.js';
import {WeatherController} from '../weather.controller.js';

function buildApp() {
  const app = new RestApplication();
  registerWeatherMcp(app, false);
  app.restController(WeatherController);
  return app;
}

describe('weather REST routes', () => {
  it('rejects a forecast with neither city nor coordinates (400, no network)', async () => {
    await using t = await createTestApp(buildApp);
    const res = await t.http.get('/weather/forecast').expect(400);
    expect(res.body.error?.code).toBe('invalid_input');
  });

  it('documents /weather/{geocode,current,forecast} in the OpenAPI spec', async () => {
    await using t = await createTestApp(buildApp);
    const spec = await t.http.get('/openapi.json').expect(200);
    const paths = Object.keys(spec.body.paths as Record<string, unknown>);
    expect(paths).toContain('/weather/forecast');
    expect(paths).toContain('/weather/current');
    expect(paths).toContain('/weather/geocode');
  });
});
