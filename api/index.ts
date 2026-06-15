// Vercel serverless entry for the weather-mcp console.
//
// Vercel owns the HTTP listener, so we boot the app with `listen: false`
// (mounts every route, binds no port) and hand Vercel the fully-mounted
// Express instance. The build is async and memoized: the first invocation
// (cold start) builds the app; warm invocations reuse the same promise.
//
// `vercel.json` rewrites every path to this function, so `/console/`,
// `/openapi.json`, and the panel APIs (context/schema/MCP inspector) all
// resolve here. (`/` is served by the static `public/index.html` landing page.)
// This console entry does not mount the Streamable HTTP MCP transport, so there
// is no `/mcp` route here — that lives in serve-http.ts.
//
// The app is typed as a Node `RequestListener` — an Express app is one, and
// this avoids depending on express's `Express` type across the .d.ts boundary
// (its call signature doesn't survive the indexed-access through @agentback).

import type {RequestListener} from 'node:http';
import type {VercelRequest, VercelResponse} from '@vercel/node';
import {buildConsoleApp} from '../dist/console.js';

let appPromise: Promise<RequestListener> | undefined;

async function getExpressApp(): Promise<RequestListener> {
  // Memoized: the first call builds the app; warm invocations reuse the promise.
  appPromise ??= buildConsoleApp({listen: false}).then(
    async app => (await app.restServer).expressApp as unknown as RequestListener,
  );
  return appPromise;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const app = await getExpressApp();
  app(req, res);
}
