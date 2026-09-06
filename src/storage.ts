import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  dbCountEntries,
  dbMarkDeleted,
  dbUpsertEntry,
  dbLoadEntries,
  dbLoadSettings,
  dbSaveEntries,
  dbSaveSettings,
} from './db';
import { Entry, normalizeEntry, Settings } from './types';

/**
 * The book lives in SQLite (see ./db). These keys are the pre-database format:
 * we still read them once to migrate, and we never delete them, so an old
 * backup of the app sandbox can still be recovered by hand.
 */
const ENTRIES_KEY = 'moi.entries.v1';
const SETTINGS_KEY = 'moi.settings.v1';
const MIGRATED_KEY = 'moi.migratedToSqlite.v1';

const DEFAULT_SETTINGS: Settings = { lang: 'en' };

/**
 * expo-sqlite's web build is still alpha and needs a cross-origin-isolated
 * page, which the plain dev server is not. Rather than lose the book there, we
 * fall back to the old key/value store for the whole session.
 */
let fellBack = false;

async function withDb<T>(run: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (fellBack) return fallback();
  try {
    return await run();
  } catch (err) {
    fellBack = true;
    console.warn('[storage] SQLite unavailable, using key/value store', err);
    return fallback();
  }
}

async function legacyEntries(): Promise<Entry[]> {
  try {
    const raw = await AsyncStorage.getItem(ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeEntry) : [];
  } catch {
    return [];
  }
}

async function legacySettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Settings) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Copies anything written before the database existed. Runs at most once, and
 * only into an empty table, so it can never clobber newer entries.
 */
async function migrateLegacyData(): Promise<void> {
  if (await AsyncStorage.getItem(MIGRATED_KEY)) return;

  const [old, oldSettings, count] = await Promise.all([
    legacyEntries(),
    legacySettings(),
    dbCountEntries(),
  ]);
  if (count === 0 && old.length) await dbSaveEntries(old);
  if ((await dbLoadSettings()) === null) await dbSaveSettings(oldSettings);

  await AsyncStorage.setItem(MIGRATED_KEY, String(Date.now()));
}

/**
 * Saves are fired without being awaited by the UI, so they are chained here:
 * two overlapping full-table rewrites could otherwise interleave and leave a
 * mix of both lists behind.
 */
let writes: Promise<unknown> = Promise.resolve();

function queueWrite(run: () => Promise<void>): Promise<void> {
  const next = writes.then(run, run);
  writes = next.catch(() => {});
  return next;
}

export async function loadEntries(): Promise<Entry[]> {
  return withDb(async () => {
    await migrateLegacyData();
    return dbLoadEntries();
  }, legacyEntries);
}

/**
 * Single-entry write. Preferred over saveEntries for edits: it touches one row
 * rather than rewriting the whole book, and it leaves tombstones alone.
 */
export async function upsertEntry(entry: Entry): Promise<void> {
  return queueWrite(() =>
    withDb(
      () => dbUpsertEntry(entry),
      async () => {
        const all = await legacyEntries();
        const next = all.some((e) => e.id === entry.id)
          ? all.map((e) => (e.id === entry.id ? entry : e))
          : [entry, ...all];
        await AsyncStorage.setItem(ENTRIES_KEY, JSON.stringify(next));
      }
    )
  );
}

/**
 * Marks a tombstone instead of dropping the row, so the delete reaches other
 * devices. The fallback store has no sync, so there it is a plain removal.
 */
export async function deleteEntry(id: string): Promise<void> {
  return queueWrite(() =>
    withDb(
      () => dbMarkDeleted(id),
      async () => {
        const all = await legacyEntries();
        await AsyncStorage.setItem(
          ENTRIES_KEY,
          JSON.stringify(all.filter((e) => e.id !== id))
        );
      }
    )
  );
}

export async function saveEntries(entries: Entry[]): Promise<void> {
  return queueWrite(() =>
    withDb(
      () => dbSaveEntries(entries),
      async () => {
        await AsyncStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
      }
    )
  );
}

export async function loadSettings(): Promise<Settings> {
  return withDb(async () => {
    await migrateLegacyData();
    return (await dbLoadSettings()) ?? DEFAULT_SETTINGS;
  }, legacySettings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  return queueWrite(() =>
    withDb(
      () => dbSaveSettings(settings),
      async () => {
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
    )
  );
}
