import { buildApp } from './app.ts';
import { migrate, pool } from './db.ts';

const app = buildApp();

async function main(): Promise<void> {
  // Safe to migrate on boot here because "boot" happens once per container.
  // The serverless entry point does not do this; see server/src/migrate.ts.
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
