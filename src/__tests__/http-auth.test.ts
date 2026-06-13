import {describe, expect, it} from 'vitest';
import {createTestApp} from '@agentback/testing';
import {securityId} from '@agentback/security';
import {buildHttpApp, type HttpAppOptions, type Principal} from '../serve-http.js';

/**
 * Integration tests for the HTTP transport's hardening — api-key auth and
 * per-(caller,tool) rate limiting wired in `serve-http.ts`. `createTestApp`
 * boots `buildHttpApp` on an ephemeral port and disposes it via `await using`,
 * so there's no hand-rolled start/stop lifecycle. We still drive the `/mcp`
 * endpoint with raw `fetch` (not `t.mcp`): the whole point is to assert the
 * status/headers a remote MCP client sees *through* the HTTP auth + rate-limit
 * gate — the in-memory `t.mcp` client would bypass it. No network to Open-Meteo
 * is involved; the limiter sits ahead of tool dispatch.
 */
const KEY = 'test-key';
const KEYS: Record<string, Principal> = {
  [KEY]: {[securityId]: 'client:test', name: 'test', scopes: ['mcp:tools']},
};

const JSON_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

const initBody = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: {name: 'test', version: '0'},
  },
});

const toolCall = (id: number) =>
  JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {name: 'get_forecast', arguments: {}},
  });

function appWith(rateLimit?: HttpAppOptions['rateLimit']) {
  return createTestApp(() =>
    buildHttpApp({keys: KEYS, port: 0, host: '127.0.0.1', rateLimit}),
  );
}

describe('weather-mcp HTTP auth + rate limiting', () => {
  it('rejects a request with no API key (401)', async () => {
    await using t = await appWith();
    const r = await fetch(new URL(t.url + '/mcp'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: initBody,
    });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  });

  it('rejects an unknown API key (401)', async () => {
    await using t = await appWith();
    const r = await fetch(new URL(t.url + '/mcp'), {
      method: 'POST',
      headers: {...JSON_HEADERS, 'x-api-key': 'not-a-real-key'},
      body: initBody,
    });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  });

  it('accepts a valid API key and opens a session', async () => {
    await using t = await appWith();
    const r = await fetch(new URL(t.url + '/mcp'), {
      method: 'POST',
      headers: {...JSON_HEADERS, 'x-api-key': KEY},
      body: initBody,
    });
    await r.body?.cancel();
    expect(r.status).toBe(200);
    expect(r.headers.get('mcp-session-id')).toBeTruthy();
  });

  it('throttles tools/call per caller and returns a JSON-RPC 429', async () => {
    // One point per (caller, tool) so the second call trips the limiter,
    // which sits ahead of the MCP handler — no tool ever runs, no network.
    await using t = await appWith({points: 1, durationSecs: 60});
    const url = new URL(t.url + '/mcp');
    const headers = {...JSON_HEADERS, 'x-api-key': KEY};

    const first = await fetch(url, {method: 'POST', headers, body: toolCall(1)});
    await first.body?.cancel();
    expect(first.status).not.toBe(429); // first call is admitted by the limiter
    expect(first.status).not.toBe(401); // and auth passed (valid key)

    const second = await fetch(url, {method: 'POST', headers, body: toolCall(2)});
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBeTruthy();
    const body = (await second.json()) as {
      jsonrpc?: string;
      id?: number;
      error?: {code?: number};
    };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(2);
    expect(body.error?.code).toBe(-32029); // MCP rate-limit error code
  });
});
