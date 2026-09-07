/**
 * Applies the schema, then exits. Run it by hand after a schema change:
 *
 *   cd server && DATABASE_URL=... npm run migrate
 *
 * Serverless has no boot to hang this off — a function only wakes for a
 * request, so migrating in-process would re-run the DDL on every cold start
 * and race two instances against each other. Hence a separate step.
 *
 * Vercel's Neon integration sets DATABASE_URL to the pooled (pgbouncer) host
 * and DATABASE_URL_UNPOOLED to the direct one. DDL belongs on the direct
 * connection, so prefer it when it is there and fall back when it is not.
 */
import pg from 'pg';
import { migrate } from './db.ts';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 1 });

try {
  await migrate(pool);
  console.log('Schema applied.');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
