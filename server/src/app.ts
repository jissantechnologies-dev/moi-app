import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { attachmentRoutes } from './attachments.ts';
import { authRoutes } from './auth.ts';
import { entryRoutes } from './entries.ts';

/**
 * Builds the API with no listening and no migration, so the two entry points
 * can differ: index.ts (Docker) listens on a port, api/[...path].ts (Vercel)
 * hands each request to the returned instance.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    // A proxy always sits in front — Traefik on the VPS, Vercel's edge in
    // serverless — so the client address comes from its headers.
    trustProxy: true,
    bodyLimit: 4 * 1024 * 1024,
  });

  // In-process counters, so this is a real limit behind Docker and only a
  // per-instance one on Vercel, where each cold start begins at zero. Vercel's
  // own edge protection is what actually bounds abuse there.
  void app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  // The app is served from the same host under /, so browser calls to /api are
  // same-origin and never preflight. No CORS plugin on purpose: adding one would
  // widen the surface for no gain.

  app.get('/api/health', async () => ({ ok: true }));

  authRoutes(app);
  entryRoutes(app);
  attachmentRoutes(app);

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    // Never let a database message reach the client.
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({
      error: status === 500 ? 'Something went wrong.' : err.message,
    });
  });

  return app;
}
