import argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from './db.ts';
import { sendPasswordResetEmail, sendVerificationEmail } from './email.ts';
import {
  hashToken,
  newOpaqueToken,
  REFRESH_TTL_DAYS,
  signAccessToken,
  verifyAccessToken,
} from './tokens.ts';

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

export async function currentUserId(req: FastifyRequest): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return verifyAccessToken(header.slice(7));
}

async function issueRefreshToken(userId: string): Promise<string> {
  const { token, hash } = newOpaqueToken();
  await pool.query(
    `INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [hash, userId, String(REFRESH_TTL_DAYS)]
  );
  return token;
}

export function authRoutes(app: FastifyInstance): void {
  // Auth endpoints are the ones worth guessing at, so they get a tighter
  // budget than the rest of the API.
  const strict = { rateLimit: { max: 10, timeWindow: '15 minutes' } };

  app.post('/api/auth/register', { config: strict }, async (req, reply) => {
    const { email, password } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return reply.code(400).send({ error: 'A valid email address is required.' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      return reply
        .code(400)
        .send({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
    }

    const clean = email.trim();
    const hash = await argon2.hash(password, { type: argon2.argon2id });

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO users (email, email_lower, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email_lower) DO NOTHING
       RETURNING id`,
      [clean, clean.toLowerCase(), hash]
    );

    // An address that is already taken gets the same response as a new one, so
    // this endpoint cannot be used to enumerate who has an account.
    if (inserted.rowCount) {
      const userId = inserted.rows[0].id;
      const { token, hash: tokenHash } = newOpaqueToken();
      await pool.query(
        `INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
         VALUES ($1, $2, 'verify', now() + interval '24 hours')`,
        [tokenHash, userId]
      );
      await sendVerificationEmail(clean, token);
    }

    return reply.code(202).send({
      ok: true,
      message: 'Check your email for a confirmation link.',
    });
  });

  app.post('/api/auth/login', { config: strict }, async (req, reply) => {
    const { email, password } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof email !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ error: 'Email and password are required.' });
    }

    const found = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      lang: string;
    }>('SELECT id, email, password_hash, lang FROM users WHERE email_lower = $1', [
      email.trim().toLowerCase(),
    ]);
    const user = found.rows[0];

    // Hash a throwaway when the account is missing, so a wrong email and a wrong
    // password take comparable time and cannot be told apart by timing.
    const ok = user
      ? await argon2.verify(user.password_hash, password).catch(() => false)
      : await argon2.hash(password, { type: argon2.argon2id }).then(() => false);

    if (!ok || !user) {
      return reply.code(401).send({ error: 'Email or password is incorrect.' });
    }

    return {
      accessToken: signAccessToken(user.id),
      refreshToken: await issueRefreshToken(user.id),
      user: { id: user.id, email: user.email, lang: user.lang },
    };
  });

  app.post('/api/auth/refresh', async (req, reply) => {
    const { refreshToken } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof refreshToken !== 'string') {
      return reply.code(400).send({ error: 'refreshToken is required.' });
    }

    const hash = hashToken(refreshToken);
    const found = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [hash]
    );
    const row = found.rows[0];
    if (!row) return reply.code(401).send({ error: 'Session expired.' });

    // Rotate: the presented token dies with this request, so a stolen copy is
    // usable at most once.
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1',
      [hash]
    );

    return {
      accessToken: signAccessToken(row.user_id),
      refreshToken: await issueRefreshToken(row.user_id),
    };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const { refreshToken } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof refreshToken === 'string') {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1',
        [hashToken(refreshToken)]
      );
    }
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (req, reply) => {
    const userId = await currentUserId(req);
    if (!userId) return reply.code(401).send({ error: 'Not signed in.' });

    const found = await pool.query(
      'SELECT id, email, email_verified, lang FROM users WHERE id = $1',
      [userId]
    );
    const user = found.rows[0];
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.email_verified,
      lang: user.lang,
    };
  });

  app.post('/api/auth/verify-email', { config: strict }, async (req, reply) => {
    const { token } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof token !== 'string') {
      return reply.code(400).send({ error: 'token is required.' });
    }

    const found = await pool.query<{ user_id: string }>(
      `UPDATE email_tokens SET used_at = now()
       WHERE token_hash = $1 AND purpose = 'verify'
         AND used_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [hashToken(token)]
    );
    const row = found.rows[0];
    if (!row) {
      return reply.code(400).send({ error: 'That link is invalid or expired.' });
    }

    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [
      row.user_id,
    ]);
    return { ok: true };
  });

  app.post('/api/auth/forgot-password', { config: strict }, async (req, reply) => {
    const { email } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof email === 'string' && EMAIL_RE.test(email.trim())) {
      const found = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE email_lower = $1',
        [email.trim().toLowerCase()]
      );
      if (found.rows[0]) {
        const { token, hash } = newOpaqueToken();
        await pool.query(
          `INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
           VALUES ($1, $2, 'reset', now() + interval '1 hour')`,
          [hash, found.rows[0].id]
        );
        await sendPasswordResetEmail(email.trim(), token);
      }
    }
    // The same answer either way, so this cannot reveal who has an account.
    return reply.send({
      ok: true,
      message: 'If that address has an account, a reset link is on its way.',
    });
  });

  app.post('/api/auth/reset-password', { config: strict }, async (req, reply) => {
    const { token, password } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof token !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ error: 'token and password are required.' });
    }
    if (password.length < MIN_PASSWORD) {
      return reply
        .code(400)
        .send({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
    }

    const found = await pool.query<{ user_id: string }>(
      `UPDATE email_tokens SET used_at = now()
       WHERE token_hash = $1 AND purpose = 'reset'
         AND used_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [hashToken(token)]
    );
    const row = found.rows[0];
    if (!row) {
      return reply.code(400).send({ error: 'That link is invalid or expired.' });
    }

    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      hash,
      row.user_id,
    ]);
    // Every existing session dies with the old password.
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [row.user_id]
    );
    return { ok: true };
  });
}
