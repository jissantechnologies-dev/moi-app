import { hasSession, syncEntries } from './api';
import {
  dbClearAll,
  dbGetMeta,
  dbLoadChangedSince,
  dbLoadEntries,
  dbSetMeta,
  dbUpsertMany,
} from './db';
import { Entry } from './types';

const CURSOR_KEY = 'sync.cursor';
const OWNER_KEY = 'sync.owner';

/**
 * The local database is a cache of one account's book. If a different account
 * signs in on this device, the cache is wiped first — otherwise the two books
 * would merge into one.
 */
export async function adoptOwner(userId: string): Promise<void> {
  const previous = await dbGetMeta(OWNER_KEY);
  if (previous && previous !== userId) await dbClearAll();
  await dbSetMeta(OWNER_KEY, userId);
}

/**
 * One round trip: push everything edited since the last cursor, take back
 * whatever the server has that is newer, and store the new cursor.
 *
 * Local edits always carry `updatedAt = Date.now()`, which is necessarily above
 * the last cursor, so unsynced work is found without a separate dirty flag.
 * A failure leaves the cursor untouched, so the next attempt retries the same
 * changes rather than dropping them.
 */
export async function syncNow(): Promise<Entry[] | null> {
  if (!hasSession()) return null;

  const since = Number(await dbGetMeta(CURSOR_KEY)) || 0;
  const outgoing = await dbLoadChangedSince(since);

  const result = await syncEntries(since, outgoing);
  if (result.entries.length) await dbUpsertMany(result.entries.map(withDefaults));
  await dbSetMeta(CURSOR_KEY, String(result.cursor ?? since));

  return dbLoadEntries();
}

/** The server is authoritative, but it may omit fields an older client wrote. */
function withDefaults(e: any): Entry {
  return {
    ...e,
    updatedAt: Number(e.updatedAt) || Date.now(),
    deleted: Boolean(e.deleted),
  };
}

/** Fire-and-forget sync for use after an edit; never throws at the caller. */
export function syncInBackground(onEntries?: (entries: Entry[]) => void): void {
  void syncNow()
    .then((entries) => {
      if (entries && onEntries) onEntries(entries);
    })
    .catch(() => {
      // Offline or the server is down. The change is already saved locally and
      // will go up on the next successful sync.
    });
}
