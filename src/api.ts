import AsyncStorage from '@react-native-async-storage/async-storage';
import { Attachment, Entry } from './types';

/**
 * In the browser the app and API share an origin, so a relative path is right
 * and avoids CORS entirely. A native build has no origin to inherit, so it
 * needs the absolute URL.
 */
const BASE =
  typeof window !== 'undefined' && window.location?.origin
    ? ''
    : 'https://moi.gvndemo.com';

const ACCESS_KEY = 'moi.auth.access.v1';
const REFRESH_KEY = 'moi.auth.refresh.v1';

export type SessionUser = { id: string; email: string; lang?: string };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadSession(): Promise<boolean> {
  const [a, r] = await Promise.all([
    AsyncStorage.getItem(ACCESS_KEY),
    AsyncStorage.getItem(REFRESH_KEY),
  ]);
  accessToken = a;
  refreshToken = r;
  return Boolean(r);
}

async function storeTokens(access: string, refresh: string): Promise<void> {
  accessToken = access;
  refreshToken = refresh;
  await AsyncStorage.multiSet([
    [ACCESS_KEY, access],
    [REFRESH_KEY, refresh],
  ]);
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

export function hasSession(): boolean {
  return Boolean(refreshToken);
}

async function raw(
  path: string,
  init: RequestInit & { auth?: boolean } = {}
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(body?.error ?? 'Request failed.', res.status);
  return body;
}

/**
 * Access tokens are deliberately short-lived, so any call can meet a 401 that
 * only means "refresh me". One retry, and only one: a second failure is a real
 * expiry and the caller should see it.
 */
async function request(
  path: string,
  init: RequestInit & { binary?: boolean } = {}
): Promise<any> {
  try {
    return await raw(path, init);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !refreshToken) throw err;

    const refreshed = await raw('/api/auth/refresh', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ refreshToken }),
    }).catch(() => null);

    if (!refreshed?.accessToken) {
      await clearSession();
      throw new ApiError('Your session has expired. Please sign in again.', 401);
    }

    await storeTokens(refreshed.accessToken, refreshed.refreshToken);
    return raw(path, init);
  }
}

export async function register(email: string, password: string): Promise<string> {
  const body = await raw('/api/auth/register', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  return body.message ?? 'Check your email for a confirmation link.';
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const body = await raw('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  await storeTokens(body.accessToken, body.refreshToken);
  return body.user;
}

export async function logout(): Promise<void> {
  const token = refreshToken;
  await clearSession();
  if (token) {
    // Best effort: the local session is already gone either way.
    await raw('/api/auth/logout', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => {});
  }
}

export async function me(): Promise<SessionUser & { emailVerified: boolean }> {
  return request('/api/auth/me');
}

export async function forgotPassword(email: string): Promise<string> {
  const body = await raw('/api/auth/forgot-password', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email }),
  });
  return body.message ?? 'If that address has an account, a reset link is on its way.';
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await raw('/api/auth/reset-password', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ token, password }),
  });
}

export async function verifyEmail(token: string): Promise<void> {
  await raw('/api/auth/verify-email', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ token }),
  });
}

export async function syncEntries(
  since: number,
  entries: Entry[]
): Promise<{ entries: Entry[]; cursor: number }> {
  return request('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ since, entries }),
  });
}

export async function pushSettings(lang: string): Promise<void> {
  await request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ lang }),
  });
}

/**
 * Uploads one bill or photo and returns the record to store on the entry. The
 * bytes go straight up as the request body: the server reads the type from the
 * Content-Type header, so there is no multipart parser on either side.
 */
export async function uploadAttachment(
  body: Blob,
  mime: string,
  name: string
): Promise<Attachment> {
  const res = await request(`/api/attachments?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body,
    binary: true,
  });
  return {
    id: String(res.id),
    mime: String(res.mime ?? mime),
    name: String(res.name ?? name),
    size: Number(res.size) || 0,
  };
}

/**
 * Fetches an attachment as a data URI. The route needs an Authorization
 * header, which an <Image src> cannot send, so the bytes come back through
 * fetch and are inlined instead of being linked.
 */
export async function attachmentDataUri(id: string): Promise<string> {
  const { bytes, mime } = await request(`/api/attachments/${encodeURIComponent(id)}`, {
    binary: true,
  });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onloadend = () => resolve(String(reader.result));
    reader.readAsDataURL(
      mime && bytes.type !== mime ? new Blob([bytes], { type: mime }) : bytes
    );
  });
}

export async function deleteAttachment(id: string): Promise<void> {
  await request(`/api/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
