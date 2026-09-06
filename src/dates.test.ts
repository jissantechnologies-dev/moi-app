/**
 * Calendar grid and phone-number tidying:
 *   npm test
 */
import assert from 'node:assert/strict';
import {
  formatDate,
  formatGrams,
  formatRupees,
  fromISODate,
  monthGrid,
  normalizeNumber,
  sortByDate,
  toISODate,
} from './format';

// --- Month grid --------------------------------------------------------
// February 2026 starts on a Sunday, so there are no leading blanks.
const feb2026 = monthGrid(2026, 1);
assert.equal(feb2026[0]?.day, 1, 'a month starting on Sunday has no lead padding');
assert.equal(feb2026.length % 7, 0, 'the grid is always whole weeks');
assert.equal(feb2026.filter(Boolean).length, 28, 'February 2026 has 28 days');

// September 2026 starts on a Tuesday: two blanks first.
const sep2026 = monthGrid(2026, 8);
assert.equal(sep2026[0], null);
assert.equal(sep2026[1], null);
assert.equal(sep2026[2]?.day, 1, 'the 1st lands on its real weekday');
assert.equal(sep2026[2]?.iso, '2026-09-01');
assert.equal(sep2026.filter(Boolean).length, 30);

// Leap years come from the Date maths, not a hardcoded table.
assert.equal(monthGrid(2024, 1).filter(Boolean).length, 29, '2024 is a leap year');
assert.equal(monthGrid(2025, 1).filter(Boolean).length, 28, '2025 is not');
assert.equal(monthGrid(2100, 1).filter(Boolean).length, 28, '2100 is not a leap year');

// December rolls into the next year correctly.
const dec = monthGrid(2026, 11);
assert.equal(dec.filter(Boolean).pop()?.iso, '2026-12-31');

// --- ISO round trip ----------------------------------------------------
assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05', 'months and days are padded');
assert.equal(toISODate(fromISODate('2026-09-05')), '2026-09-05', 'round trip is stable');
// Parsed as local midnight, so the day never slips across a timezone.
assert.equal(fromISODate('2026-09-05').getDate(), 5);
assert.equal(fromISODate('2026-09-05').getMonth(), 8);

// --- Display formatting ------------------------------------------------
assert.equal(formatDate('2026-09-05', 'en'), '5 Sep 2026');
assert.equal(formatDate('', 'en'), '', 'a missing date renders as blank, not "Invalid Date"');
assert.equal(formatRupees(1234567), 'Rs. 12,34,567', 'Indian digit grouping');
assert.equal(formatRupees(500), 'Rs. 500');
assert.equal(formatRupees(0), 'Rs. 0');
assert.equal(formatGrams(8.5), '8.5');
assert.equal(formatGrams(8), '8', 'whole grams lose the trailing zero');

// --- Phone numbers from contacts ---------------------------------------
assert.equal(normalizeNumber('+91 98765 43210'), '+919876543210', 'country code kept');
assert.equal(normalizeNumber('098765-43210'), '09876543210', 'leading zero kept');
assert.equal(normalizeNumber('(0452) 234 5678'), '04522345678', 'brackets stripped');

console.log('dates/contacts: all assertions passed');

// --- History ordering --------------------------------------------------
const mk = (id: string, functionDate: string, createdAt: number) =>
  ({ id, functionDate, createdAt }) as any;

const mixed = [
  mk('b', '2026-02-01', 10),
  mk('a', '2024-05-09', 20),
  mk('c', '2026-02-01', 30), // same date as b, written later
];

assert.deepEqual(
  sortByDate(mixed).map((e) => e.id),
  ['c', 'b', 'a'],
  'newest function first, later-written wins a tie'
);
assert.deepEqual(
  sortByDate(mixed, false).map((e) => e.id),
  ['a', 'b', 'c'],
  'oldest first is the exact reverse'
);
assert.deepEqual(
  mixed.map((e) => e.id),
  ['b', 'a', 'c'],
  'the caller\u2019s array is left untouched'
);

console.log('history ordering: all assertions passed');
