/**
 * Vercel entry point. Every /api/* request rewrites here (see vercel.json) and
 * is handed to the same Fastify instance the Docker deployment runs.
 *
 * It imports the COMPILED server (server/dist), not the TypeScript sources.
 * Vercel compiles this file to .js but does not rewrite or bundle a '.ts'
 * import path, so importing ../server/src/app.ts fails at runtime with
 * "Cannot find module". `npm run build:server` produces server/dist ahead of
 * the web export; see vercel.json's buildCommand.
 *
 * The app is built once per instance, not per request, so a warm instance
 * reuses it. `ready()` resolves after plugins register; awaiting it on every
 * call is cheap once settled, and Fastify's own HTTP server object is used
 * purely as a request router — nothing ever calls listen().
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../server/dist/app.js';

const app = buildApp();
const ready = app.ready();

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await ready;
  app.server.emit('request', req, res);
}
