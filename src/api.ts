import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
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
/** Marks a stored session as one the user asked to be remembered. */
const REMEMBER_KEY = 'moi.auth.remember.v1';

/**
 * Where a signed-in session is kept.
 *
 * Remembering a sign-in writes to AsyncStorage, which outlives the browser or
 * the app. Declining writes to sessionStorage instead, so the session dies with
 * the tab. Native has no sessionStorage; there the tokens stay in memory only,
 * which ends the session when the app is closed.
 */
const scoped = {
  store(): Storage | null {
    if (Platform.OS !== 'web') return null;
    try {
      return globalThis.sessionStorage ?? null;
    } catch {
      // Blocked site data can make even touching sessionStorage throw.
      return null;
    }
  },
  read(key: string): string | null {
    try {
      return this.store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  write(key: string, value: string): void {
    try {
      this.store()?.setItem(key, value);
    } catch {
      // Memory still holds the tokens, so the current session keeps working.
    }
  },
  remove(key: string): void {
    try {
      this.store()?.removeItem(key);
    } catch {
      // Nothing to recover; the tokens are cleared from memory regardless.
    }
  },
};

/**
 * Whether the live session should outlive the browser or app. Restored by
 * loadSession so that a token refresh writes back to whichever store the
 * session was originally signed in to.
 */
let persistSession = true;

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
  const [a, r, remembered] = await Promise.all([
    AsyncStorage.getItem(ACCESS_KEY),
    AsyncStorage.getItem(REFRESH_KEY),
    AsyncStorage.getItem(REMEMBER_KEY),
  ]);

  // Only a remembered sign-in is kept in AsyncStorage. Tokens written before
  // the flag existed predate the choice, and every session was remembered
  // then, so they are honoured and the flag is backfilled.
  if (r) {
    if (remembered === null) await AsyncStorage.setItem(REMEMBER_KEY, '1');
    accessToken = a;
    refreshToken = r;
    persistSession = true;
    return true;
  }

  // A session the user chose not to have remembered only survives inside the
  // tab that created it.
  const sessionRefresh = scoped.read(REFRESH_KEY);
  if (sessionRefresh) {
    accessToken = scoped.read(ACCESS_KEY);
    refreshToken = sessionRefresh;
    persistSession = false;
    return true;
  }

  accessToken = null;
  refreshToken = null;
  return false;
}

async function storeTokens(access: string, refresh: string): Promise<void> {
  accessToken = access;
  refreshToken = refresh;

  if (!persistSession) {
    scoped.write(ACCESS_KEY, access);
    scoped.write(REFRESH_KEY, refresh);
    return;
  }

  await AsyncStorage.multiSet([
    [ACCESS_KEY, access],
    [REFRESH_KEY, refresh],
    [REMEMBER_KEY, '1'],
  ]);
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  persistSession = true;
  scoped.remove(ACCESS_KEY);
  scoped.remove(REFRESH_KEY);
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, REMEMBER_KEY]);
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

/**
 * Signs in. `remember` decides whether the session outlives the browser or
 * app; declining keeps it to the current tab (web) or run (native).
 */
export async function login(
  email: string,
  password: string,
  remember = true
): Promise<SessionUser> {
  const body = await raw('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  // Set before storing, since storeTokens reads it to pick the store. Any
  // tokens from a previous session are cleared so a remembered sign-in cannot
  // be left behind by an unremembered one.
  await clearSession();
  persistSession = remember;
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

export type AuthConfig = { google: boolean };

/** What the sign-in screen may offer; Google appears only if the server has keys. */
export async function authConfig(): Promise<AuthConfig> {
  const res = await request('/api/auth/config', { method: 'GET' });
  return { google: Boolean(res?.google) };
}

/** Where the browser goes to start Google sign-in. A full navigation, not a popup. */
export function googleSignInUrl(): string {
  return `${BASE}/api/auth/google/start`;
}

/**
 * Trades the one-time code an OAuth redirect leaves in the URL for a session.
 * The code is single use and expires in two minutes, which is what makes it
 * safe for it to have travelled in a URL at all.
 */
export async function exchangeAuthCode(code: string): Promise<SessionUser> {
  const res = await request('/api/auth/exchange', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  await storeTokens(res.accessToken, res.refreshToken);
  return res.user as SessionUser;
}
