import * as SQLite from 'expo-sqlite';
import { Entry, normalizeEntry, Settings } from './types';

/**
 * SQLite is the system of record. Entries live in their own table so a crash
 * mid-write can only lose the row being written, not the whole book — which is
 * what a single JSON blob in AsyncStorage risked.
 */
const DB_NAME = 'moi.db';

let handle: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!handle) handle = open();
  return handle;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DB_NAME);
  await migrate(database);
  return database;
}

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await database.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY NOT NULL,
        firstName TEXT NOT NULL DEFAULT '',
        lastName TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        place TEXT NOT NULL DEFAULT '',
        functionDate TEXT NOT NULL DEFAULT '',
        functionName TEXT NOT NULL DEFAULT '',
        direction TEXT NOT NULL DEFAULT 'given',
        giftKind TEXT NOT NULL DEFAULT 'cash',
        amount REAL NOT NULL DEFAULT 0,
        goldGrams REAL NOT NULL DEFAULT 0,
        goldCarat INTEGER NOT NULL DEFAULT 22,
        giftNote TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS entries_created_at ON entries (createdAt DESC);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      PRAGMA user_version = 1;
    `);
  }
  if (version < 2) {
    await database.execAsync(`
      ALTER TABLE entries ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE entries ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
      UPDATE entries SET updatedAt = createdAt WHERE updatedAt = 0;
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      PRAGMA user_version = 2;
    `);
  }
  if (version < 3) {
    // Bills and gift photos, as the JSON list the server also stores. The
    // bytes themselves never touch this database.
    await database.execAsync(`
      ALTER TABLE entries ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';
      PRAGMA user_version = 3;
    `);
  }
}

export async function dbGetMeta(key: string): Promise<string | null> {
  const row = await (await db()).getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function dbSetMeta(key: string, value: string): Promise<void> {
  await (await db()).runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

/** Wipes the cached book — used when a different account signs in. */
export async function dbClearAll(): Promise<void> {
  await (await db()).execAsync(
    "DELETE FROM entries; DELETE FROM meta; DELETE FROM settings;"
  );
}

export async function dbUpsertMany(entries: Entry[]): Promise<void> {
  const database = await db();
  await database.withTransactionAsync(async () => {
    for (const e of entries) await upsert(database, e);
  });
}

export async function dbLoadEntries(): Promise<Entry[]> {
  const rows = await (await db()).getAllAsync<any>(
    'SELECT * FROM entries WHERE deleted = 0 ORDER BY createdAt DESC'
  );
  return rows.map(normalizeEntry);
}

/** Includes tombstones — only the sync layer wants these. */
export async function dbLoadChangedSince(since: number): Promise<Entry[]> {
  const rows = await (await db()).getAllAsync<any>(
    'SELECT * FROM entries WHERE updatedAt > ? ORDER BY updatedAt',
    since
  );
  return rows.map(normalizeEntry);
}

/** Marks a tombstone rather than removing the row, so the delete can sync. */
export async function dbMarkDeleted(id: string): Promise<void> {
  await (await db()).runAsync(
    'UPDATE entries SET deleted = 1, updatedAt = ? WHERE id = ?',
    [Date.now(), id]
  );
}

/**
 * Mirrors the in-memory list into the table in one transaction, so a failure
 * leaves the previous contents intact rather than a half-written book.
 */
export async function dbSaveEntries(entries: Entry[]): Promise<void> {
  const database = await db();
  await database.withTransactionAsync(async () => {
    const keep = entries.map((e) => e.id);
    const holes = keep.map(() => '?').join(',');
    await database.runAsync(
      keep.length
        ? `DELETE FROM entries WHERE id NOT IN (${holes})`
        : 'DELETE FROM entries',
      keep
    );
    for (const e of entries) await upsert(database, e);
  });
}

export async function dbUpsertEntry(entry: Entry): Promise<void> {
  await upsert(await db(), entry);
}

export async function dbDeleteEntry(id: string): Promise<void> {
  await (await db()).runAsync('DELETE FROM entries WHERE id = ?', id);
}

async function upsert(
  database: SQLite.SQLiteDatabase,
  e: Entry
): Promise<void> {
  await database.runAsync(
    `INSERT INTO entries
       (id, firstName, lastName, phone, place, functionDate, functionName,
        direction, giftKind, amount, goldGrams, goldCarat, giftNote, notes,
        createdAt, updatedAt, deleted, attachments)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       firstName = excluded.firstName,
       lastName = excluded.lastName,
       phone = excluded.phone,
       place = excluded.place,
       functionDate = excluded.functionDate,
       functionName = excluded.functionName,
       direction = excluded.direction,
       giftKind = excluded.giftKind,
       amount = excluded.amount,
       goldGrams = excluded.goldGrams,
       goldCarat = excluded.goldCarat,
       giftNote = excluded.giftNote,
       notes = excluded.notes,
       createdAt = excluded.createdAt,
       updatedAt = excluded.updatedAt,
       deleted = excluded.deleted,
       attachments = excluded.attachments
     WHERE excluded.updatedAt >= entries.updatedAt`,
    [
      e.id,
      e.firstName,
      e.lastName,
      e.phone,
      e.place,
      e.functionDate,
      e.functionName,
      e.direction,
      e.giftKind,
      e.amount,
      e.goldGrams,
      e.goldCarat,
      e.giftNote,
      e.notes,
      e.createdAt,
      e.updatedAt,
      e.deleted ? 1 : 0,
      JSON.stringify(e.attachments),
    ]
  );
}

export async function dbLoadSettings(): Promise<Settings | null> {
  const row = await (await db()).getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    'lang'
  );
  if (!row) return null;
  return { lang: row.value === 'ta' ? 'ta' : 'en' };
}

export async function dbSaveSettings(settings: Settings): Promise<void> {
  await (await db()).runAsync(
    `INSERT INTO settings (key, value) VALUES ('lang', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    settings.lang
  );
}

export async function dbCountEntries(): Promise<number> {
  const row = await (await db()).getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM entries'
  );
  return row?.n ?? 0;
}
