// Pre-publish smoke for the local-linked @agentback/rest Fetch-adapter seam
// (Stage 1 Part 3: RestServer.fetchHandler()). Standalone (not vitest — the
// demo's vitest transform doesn't evaluate experimentalDecorators), compiled by
// `pnpm build` and run with `node dist/verify-fetch.js`. This MCP-only demo has
// no @api routes, so it proves the exported Web surface is REACHABLE and emits
// the nested error envelope in a consumer build against local agentback.
// (Positive route dispatch is proven by @agentback/rest's own registry parity
// test.) Lives on verify/local-agentback.
import {strict as assert} from 'node:assert';
import {RestApplication, type RestServer} from '@agentback/rest';

async function main(): Promise<void> {
  const app = new RestApplication();
  app.configure('servers.RestServer').to({port: 0});
  await app.start();
  try {
    const server = await app.getServer<RestServer>('RestServer');
    const host = server.fetchHandler();
    const miss = await host.fetch(new Request('http://x/nope'));
    assert.equal(miss.status, 404);
    assert.deepEqual(await miss.json(), {
      error: {code: 'not_found', message: 'Not Found'},
    });
    console.log(
      '✓ fetchHandler() reachable + nested 404 envelope verified against local @agentback/rest',
    );
  } finally {
    await app.stop();
  }
}

main().catch((err: unknown) => {
  console.error('✗ fetchHandler smoke failed:', err);
  process.exit(1);
});
