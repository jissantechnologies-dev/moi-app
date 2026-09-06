import crypto from 'node:crypto';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

/** Short, because a stolen access token cannot be revoked before it expires. */
const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 30;

type Payload = { sub: string; exp: number };

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sign(data: string): string {
  return b64url(crypto.createHmac('sha256', SECRET!).update(data).digest());
}

/**
 * A minimal HS256 JWT. Rolling it by hand keeps the dependency list short; the
 * only security-relevant details are the constant-time compare and the fact
 * that the algorithm is fixed here rather than read from the header.
 */
export function signAccessToken(userId: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: Payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS,
  };
  const body = `${header}.${b64url(JSON.stringify(payload))}`;
  return `${body}.${sign(body)}`;
}

export function verifyAccessToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const body = `${parts[0]}.${parts[1]}`;
  const expected = sign(body);
  const got = parts[2];
  // Compare as fixed-length digests so a length mismatch cannot throw.
  if (
    expected.length !== got.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString('utf8')
    ) as Payload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
      return null;
    }
    return String(payload.sub);
  } catch {
    return null;
  }
}

/** Opaque random token; only its hash is ever stored. */
export function newOpaqueToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
