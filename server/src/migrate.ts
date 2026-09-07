/**
 * Applies the schema, then exits. Run it by hand after a schema change:
 *
 *   cd server && DATABASE_URL=... npm run migrate
 *
 * Serverless has no boot to hang this off — a function only wakes for a
 * request, so migrating in-process would re-run the DDL on every cold start
 * and race two instances against each other. Hence a separate step.
 */
import { migrate, pool } from './db.ts';

try {
  await migrate();
  console.log('Schema applied.');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
