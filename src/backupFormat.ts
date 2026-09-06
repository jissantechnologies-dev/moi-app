/**
 * Pure serialisation logic — no native modules, so it can be exercised outside
 * the app. File writing and sharing live in ./export.ts.
 */
import { formatGrams } from './format';
import { Entry, normalizeEntry } from './types';

export const BACKUP_MAGIC = 'moi-book-backup';
export const BACKUP_VERSION = 1;

export type Backup = {
  app: typeof BACKUP_MAGIC;
  version: number;
  exportedAt: string;
  entries: Entry[];
};

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  // Quote anything a spreadsheet could misread, and double any inner quotes.
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function buildCsv(entries: Entry[]): string {
  const header = [
    'First name',
    'Last name',
    'Phone',
    'Place',
    'Function',
    'Function date',
    'Direction',
    'Gift type',
    'Amount (Rs.)',
    'Gold grams',
    'Gold carat',
    'Gift details',
    'Notes',
  ];
  const rows: (string | number)[][] = [...entries]
    .sort((a, b) => a.functionDate.localeCompare(b.functionDate))
    .map((e) => {
      const isGold = e.giftKind === 'gold' && e.goldGrams > 0;
      return [
        e.firstName,
        e.lastName,
        // Leading zeros survive and Excel will not turn this into 9.19e9.
        e.phone ? '="' + e.phone.replace(/"/g, '') + '"' : '',
        e.place,
        e.functionName,
        e.functionDate,
        e.direction === 'given' ? 'Given' : 'Received',
        e.giftKind,
        e.amount || '',
        isGold ? formatGrams(e.goldGrams) : '',
        isGold ? e.goldCarat : '',
        e.giftNote,
        e.notes,
      ];
    });

  // The BOM makes Excel read the Tamil text correctly.
  return (
    '﻿' +
    [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}

export function buildBackup(entries: Entry[]): string {
  const backup: Backup = {
    app: BACKUP_MAGIC,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(backup, null, 2);
}

/** Returns the entries in the backup, or null if the file is not one of ours. */
export function parseBackup(text: string): Entry[] | null {
  try {
    const data = JSON.parse(text);
    if (data?.app !== BACKUP_MAGIC || !Array.isArray(data.entries)) return null;
    return data.entries.map(normalizeEntry).filter((e: Entry) => e.id);
  } catch {
    return null;
  }
}

export function stamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(
    now.getDate()
  )}-${p(now.getHours())}${p(now.getMinutes())}`;
}
