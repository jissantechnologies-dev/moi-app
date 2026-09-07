import pg from 'pg';

/**
 * One long-lived container can hold a real pool. Serverless cannot: every
 * instance opens its own, so a pool of 10 across 20 warm instances asks Neon
 * for 200 connections and exhausts it. There the answer is one connection per
 * instance, pointed at Neon's pgbouncer endpoint (the -pooler host) which does
 * the actual pooling on their side.
 */
const serverless = Boolean(process.env.VERCEL);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: serverless ? 1 : 10,
  // Do not hold a socket across invocations: a frozen instance's connection is
  // dead to us but still counted by the server.
  idleTimeoutMillis: serverless ? 10000 : 30000,
  connectionTimeoutMillis: 10000,
});

/**
 * Statements are all IF NOT EXISTS, so re-running is a no-op and a fresh
 * database gets built in one go.
 *
 * Takes the pool to run against because DDL should not go through pgbouncer:
 * migrate.ts points this at Neon's direct endpoint instead.
 */
export async function migrate(target: pg.Pool = pool): Promise<void> {
  await target.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             BIGSERIAL PRIMARY KEY,
      email          TEXT NOT NULL,
      -- Logins are matched on the lowercased form so Foo@x.com and foo@x.com
      -- cannot become two accounts.
      email_lower    TEXT NOT NULL UNIQUE,
      password_hash  TEXT NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      lang           TEXT NOT NULL DEFAULT 'en'
    );

    -- Refresh tokens are stored only as a SHA-256 hash: a database leak must not
    -- hand out usable sessions.
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token_hash  TEXT PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at  TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS refresh_tokens_user ON refresh_tokens (user_id);

    -- Email verification and password reset share one table; the purpose column says which.
    CREATE TABLE IF NOT EXISTS email_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose    TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS entries (
      id            TEXT NOT NULL,
      user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      first_name    TEXT NOT NULL DEFAULT '',
      last_name     TEXT NOT NULL DEFAULT '',
      phone         TEXT NOT NULL DEFAULT '',
      place         TEXT NOT NULL DEFAULT '',
      function_date TEXT NOT NULL DEFAULT '',
      function_name TEXT NOT NULL DEFAULT '',
      direction     TEXT NOT NULL DEFAULT 'given',
      gift_kind     TEXT NOT NULL DEFAULT 'cash',
      amount        DOUBLE PRECISION NOT NULL DEFAULT 0,
      gold_grams    DOUBLE PRECISION NOT NULL DEFAULT 0,
      gold_carat    INTEGER NOT NULL DEFAULT 22,
      gift_note     TEXT NOT NULL DEFAULT '',
      notes         TEXT NOT NULL DEFAULT '',
      created_at    BIGINT NOT NULL DEFAULT 0,
      -- Sync bookkeeping. Deletes leave a tombstone so other devices learn about
      -- them; a row is never hard-deleted while the account lives.
      updated_at    BIGINT NOT NULL DEFAULT 0,
      deleted       BOOLEAN NOT NULL DEFAULT FALSE,
      -- Bills and gift photos. The bytes live in Blob storage; this holds the
      -- JSON list of {id, mime, name, size} pointing at them. Keeping it on the
      -- entry lets attachments ride the existing sync rather than needing a
      -- protocol of their own.
      attachments   TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS entries_user_updated ON entries (user_id, updated_at);

    -- The column above landed after the first release, so a database created
    -- before it needs the column added rather than the table created.
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS attachments TEXT NOT NULL DEFAULT '[]';
  `);
}
