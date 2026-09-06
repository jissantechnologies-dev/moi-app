import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { authRoutes } from './auth.ts';
import { migrate, pool } from './db.ts';
import { entryRoutes } from './entries.ts';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  // Traefik sits in front, so the client address comes from its headers.
  trustProxy: true,
  bodyLimit: 4 * 1024 * 1024,
});

await app.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
});

// The app is served from the same host under /, so browser calls to /api are
// same-origin and never preflight. No CORS plugin on purpose: adding one would
// widen the surface for no gain.

app.get('/api/health', async () => ({ ok: true }));

authRoutes(app);
entryRoutes(app);

app.setErrorHandler((error, _req, reply) => {
  app.log.error(error);
  // Never let a database message reach the client.
  const err = error as { statusCode?: number; message?: string };
  const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  reply.code(status).send({
    error: status === 500 ? 'Something went wrong.' : err.message,
  });
});

async function main(): Promise<void> {
  await migrate();
  await app.listen({ port: Number(process.env.PORT ?? 8080), host: '0.0.0.0' });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      await app.close();
      await pool.end();
      process.exit(0);
    })();
  });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
