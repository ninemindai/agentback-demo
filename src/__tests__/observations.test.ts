// Copyright ninemind.ai and LoopBack contributors. All Rights Reserved.
// Node module: weather-mcp-server
// This file is licensed under the MIT License.

// The dual-surface payoff: a CSV uploaded over REST is summarized by the MCP
// tool (same FileStore + ObservationsService, one container), and a report
// streams back out over REST. One test app exercises both surfaces.
import {describe, expect, it} from 'vitest';
import {createTestApp} from '@agentback/testing';
import {RestApplication} from '@agentback/rest';
import {registerWeatherMcp} from '../wiring.js';
import {ObservationsController} from '../observations.controller.js';

function buildApp() {
  const app = new RestApplication();
  registerWeatherMcp(app, false); // MCP in-process (no stdio); HTTP routes too
  app.restController(ObservationsController);
  return app;
}

const CSV =
  'date,temp_c\n2026-01-01,3.2\n2026-01-02,5.0\n2026-01-03,-1.5\n2026-01-04,2.1\n';

interface SummaryResult {
  observationsId: string | null;
  summary: {
    count: number;
    temperatureC: {min: number; max: number; mean: number};
    dateRange: {from: string; to: string};
  };
}

describe('observations upload + summarize (REST + MCP)', () => {
  it('uploads a CSV over REST, summarizes it over MCP, downloads a report', async () => {
    await using t = await createTestApp(buildApp);

    // 1. REST: upload the CSV (multipart) → parsed + summarized + stored.
    const up = await t.http
      .post('/observations/')
      .attach('file', Buffer.from(CSV), {
        filename: 'jan.csv',
        contentType: 'text/csv',
      })
      .expect(201);
    expect(up.body.filename).toBe('jan.csv');
    expect(up.body.summary).toMatchObject({
      count: 4,
      temperatureC: {min: -1.5, max: 5, mean: 2.2},
      dateRange: {from: '2026-01-01', to: '2026-01-04'},
    });
    const id: string = up.body.id;

    // 2. MCP: the agent summarizes the SAME uploaded file by id.
    const viaMcp = await t.mcp.callTool({
      name: 'summarize_observations',
      arguments: {observationsId: id},
    });
    expect(viaMcp.isError).toBeFalsy();
    const out = viaMcp.structuredContent as SummaryResult;
    expect(out.observationsId).toBe(id);
    expect(out.summary.count).toBe(4);
    expect(out.summary.temperatureC.max).toBe(5);

    // 3. REST: stream a summary report back out.
    const report = await t.http.get(`/observations/${id}/report`).expect(200);
    expect(report.headers['content-type']).toMatch(/text\/csv/);
    expect(report.headers['content-disposition']).toContain('report-jan.csv');
    expect(report.text).toContain('mean_temp_c,2.2');
  });

  it('summarize_observations also accepts inline csv (standalone MCP path)', async () => {
    await using t = await createTestApp(buildApp);
    const res = await t.mcp.callTool({
      name: 'summarize_observations',
      arguments: {csv: CSV},
    });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as SummaryResult;
    expect(out.observationsId).toBeNull();
    expect(out.summary.count).toBe(4);
  });

  it('exposes summarize_observations alongside the weather tools', async () => {
    await using t = await createTestApp(buildApp);
    const names = (await t.mcp.listTools()).tools.map(x => x.name);
    expect(names).toContain('summarize_observations');
    expect(names).toContain('get_forecast');
  });

  it('rejects an oversize-or-wrong-type upload (415) and a bad id (404)', async () => {
    await using t = await createTestApp(buildApp);
    // wrong content type → pre-stream 415
    await t.http
      .post('/observations/')
      .attach('file', Buffer.from('{}'), {
        filename: 'x.json',
        contentType: 'application/json',
      })
      .expect(415);
    // unknown id → 404
    await t.http.get('/observations/does-not-exist/report').expect(404);
  });
});
