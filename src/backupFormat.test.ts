/**
 * Plain assertions, no test runner needed:
 *   npm test
 */
import assert from 'node:assert/strict';
import { BACKUP_MAGIC, buildBackup, buildCsv, parseBackup } from './backupFormat';
import { Entry } from './types';

const base: Entry = {
  id: 'a1',
  firstName: 'Mala',
  lastName: '',
  phone: '',
  place: '',
  functionDate: '2026-01-05',
  functionName: '',
  direction: 'given',
  giftKind: 'cash',
  amount: 0,
  goldGrams: 0,
  goldCarat: 22,
  giftNote: '',
  notes: '',
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
};
const e = (o: Partial<Entry>): Entry => ({ ...base, ...o });

// --- CSV ---------------------------------------------------------------
const csv = buildCsv([
  e({
    id: 'b',
    firstName: 'Raja, S',
    lastName: 'Kumar',
    phone: '09876543210',
    place: 'Madurai',
    amount: 5000,
    functionDate: '2026-02-01',
  }),
  e({
    id: 'a',
    direction: 'received',
    giftKind: 'gold',
    goldGrams: 8.5,
    goldCarat: 22,
    giftNote: 'chain "long"',
    notes: 'line1\nline2',
  }),
]);
const lines = csv.split('\r\n');

assert.ok(csv.startsWith('﻿'), 'starts with a BOM for Excel');
// Oldest function first, so the gold row (Jan) comes before the cash row (Feb).
assert.ok(lines[1].startsWith('Mala,'), 'sorted by function date');
assert.ok(lines[2].startsWith('"Raja, S",Kumar,'), 'comma in a name is quoted');
assert.ok(lines[2].includes('"=""09876543210"""'), 'phone keeps its leading zero');
assert.ok(lines[1].includes('"chain ""long"""'), 'inner quotes are doubled');
assert.ok(lines[1].includes('"line1\nline2"'), 'newline in notes is quoted');
assert.ok(lines[1].includes(',8.5,22,'), 'gold weight and carat are written');
assert.ok(lines[2].includes(',cash,5000,,,'), 'cash rows leave gold blank');
assert.equal(lines[0].split(',').length, 13, 'header column count');

// --- Backup round trip -------------------------------------------------
const restored = parseBackup(buildBackup([e({ id: 'x', goldGrams: 4 })]));
assert.ok(restored, 'a backup we wrote can be read back');
assert.equal(restored!.length, 1);
assert.equal(restored![0].id, 'x');
assert.equal(restored![0].goldGrams, 4);

// --- Rejecting and repairing input -------------------------------------
assert.equal(parseBackup('not json'), null, 'garbage is rejected');
assert.equal(parseBackup('{"app":"something-else"}'), null, 'other apps rejected');
assert.equal(
  parseBackup(JSON.stringify({ app: BACKUP_MAGIC })),
  null,
  'missing entries array is rejected'
);

// An entry written before gold and carat existed must still load.
const old = parseBackup(
  JSON.stringify({
    app: BACKUP_MAGIC,
    entries: [{ id: 'old', firstName: 'Vel', direction: 'received', amount: 1000 }],
  })
);
assert.equal(old![0].goldGrams, 0, 'missing gold weight defaults to 0');
assert.equal(old![0].goldCarat, 22, 'missing carat defaults to 22K');
assert.equal(old![0].giftKind, 'cash', 'missing gift type defaults to cash');

// Entries with no id are dropped rather than creating unreachable records.
const noId = parseBackup(
  JSON.stringify({ app: BACKUP_MAGIC, entries: [{ firstName: 'Ghost' }] })
);
assert.equal(noId!.length, 0, 'entries without an id are dropped');

console.log('backupFormat: all assertions passed');
