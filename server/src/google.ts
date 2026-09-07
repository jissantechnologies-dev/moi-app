import type { FastifyInstance } from 'fastify';
import { pool } from './db.ts';
import { hashToken, newOpaqueToken } from './tokens.ts';

/**
 * Google sign-in, as a server-side redirect rather than a popup or One Tap.
 *
 * That is not a style choice. The site is served cross-origin isolated —
 * Cross-Origin-Opener-Policy: same-origin and COEP: credentialless — because
 * expo-sqlite keeps the book in OPFS and will not do so otherwise. COOP severs
 * window.opener, so Google's popup cannot hand the credential back, and COEP
 * blocks the One Tap iframe. Relaxing either to make the popup work would drop
 * cross-origin isolation and silently take the book back to localStorage.
 *
 * A full-page redirect is unaffected by both, so that is what this does.
 */
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const CODE_TTL_SECONDS = 120;
const STATE_COOKIE = 'moi_oauth_state';

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function appUrl(): string {
  return process.env.APP_URL ?? 'https://moi.gvndemo.com';
}

function redirectUri(): string {
  return `${appUrl()}/api/auth/google/callback`;
}

/** Sends the browser back to the app with a short message it can show. */
function backToApp(reply: any, params: string): void {
  reply.redirect(`${appUrl()}/?${params}`, 302);
}

type GoogleClaims = { sub: string; email: string; emailVerified: boolean };

/**
 * The id_token arrives on a direct server-to-server TLS response from Google's
 * token endpoint, so its signature does not need re-checking — Google's own
 * documentation treats tokens fetched this way as trusted. Issuer and audience
 * are still checked, because those say the token was minted for *this* app.
 */
function readIdToken(idToken: string): GoogleClaims | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const issuer = String(payload.iss ?? '');
    if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') return null;
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) return null;
    const email = String(payload.email ?? '').trim().toLowerCase();
    if (!email || !payload.sub) return null;
    return {
      sub: String(payload.sub),
      email,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    };
  } catch {
    return null;
  }
}

/**
 * Finds the account this Google identity belongs to, or makes one.
 *
 * Matching on email as well as on the Google id is what stops a second account
 * appearing for someone who first signed up with a password and later used the
 * Google button. Only a verified Google email may claim an existing row —
 * otherwise anyone able to set an unverified address on a Google account could
 * take over the matching account here.
 */
async function findOrCreateUser(claims: GoogleClaims): Promise<string | null> {
  const byGoogle = await pool.query('SELECT id FROM users WHERE google_sub = $1', [claims.sub]);
  if (byGoogle.rowCount) return String(byGoogle.rows[0].id);

  if (!claims.emailVerified) return null;

  const byEmail = await pool.query('SELECT id FROM users WHERE email_lower = $1', [claims.email]);
  if (byEmail.rowCount) {
    const id = String(byEmail.rows[0].id);
    await pool.query(
      'UPDATE users SET google_sub = $1, email_verified = TRUE WHERE id = $2',
      [claims.sub, id]
    );
    return id;
  }

  const created = await pool.query(
    `INSERT INTO users (email, email_lower, password_hash, email_verified, google_sub)
     VALUES ($1, $2, NULL, TRUE, $3)
     RETURNING id`,
    [claims.email, claims.email, claims.sub]
  );
  return String(created.rows[0].id);
}

export function googleRoutes(app: FastifyInstance): void {
  app.get('/api/auth/google/start', async (req, reply) => {
    if (!googleConfigured()) {
      return backToApp(reply, 'authError=google_unavailable');
    }

    // State ties the callback to the browser that began the flow, which is
    // what stops a third party from replaying their own login against it.
    const state = newOpaqueToken().token;
    reply.header(
      'Set-Cookie',
      `${STATE_COOKIE}=${state}; Path=/api/auth/google; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
    );

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'openid email',
      state,
      prompt: 'select_account',
    });
    return reply.redirect(`${AUTH_ENDPOINT}?${params}`, 302);
  });

  app.get('/api/auth/google/callback', async (req, reply) => {
    if (!googleConfigured()) return backToApp(reply, 'authError=google_unavailable');

    const query = (req.query ?? {}) as Record<string, string>;
    if (query.error) return backToApp(reply, 'authError=google_cancelled');

    const cookies = String(req.headers.cookie ?? '');
    const expected = cookies
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${STATE_COOKIE}=`))
      ?.slice(STATE_COOKIE.length + 1);

    if (!query.state || !expected || query.state !== expected) {
      return backToApp(reply, 'authError=google_state');
    }
    // Spent, whatever happens next.
    reply.header('Set-Cookie', `${STATE_COOKIE}=; Path=/api/auth/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);

    if (!query.code) return backToApp(reply, 'authError=google_failed');

    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: query.code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    }).catch(() => null);

    if (!res?.ok) return backToApp(reply, 'authError=google_failed');

    const body = (await res.json().catch(() => null)) as { id_token?: string } | null;
    const claims = body?.id_token ? readIdToken(body.id_token) : null;
    if (!claims) return backToApp(reply, 'authError=google_failed');

    const userId = await findOrCreateUser(claims);
    if (!userId) return backToApp(reply, 'authError=google_unverified');

    const { token, hash } = newOpaqueToken();
    await pool.query(
      `INSERT INTO auth_codes (code_hash, user_id, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [hash, userId, String(CODE_TTL_SECONDS)]
    );

    return backToApp(reply, `auth=${encodeURIComponent(token)}`);
  });
}

/** Redeems a one-time code, returning the user it belongs to. Single use. */
export async function redeemAuthCode(code: string): Promise<string | null> {
  const result = await pool.query(
    `UPDATE auth_codes SET used_at = now()
      WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [hashToken(code)]
  );
  return result.rowCount ? String(result.rows[0].user_id) : null;
}
