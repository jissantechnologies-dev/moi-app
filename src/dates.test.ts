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
  totalsOf,
  whatsappNumber,
  sortByDate,
  toISODate,
} from './format';
import { normalizeEntry } from './types';

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

// --- totals: cash and gold accumulate separately, and never double-count ---

const gift = (o: any) => normalizeEntry(o);

// One person, two gifts at different functions: they add up per unit.
const separate = totalsOf([
  gift({ id: 'c', direction: 'given', giftKind: 'cash', amount: 5000 }),
  gift({ id: 'g', direction: 'given', giftKind: 'gold', goldGrams: 8, amount: 0 }),
]);
assert.equal(separate.given, 5000, 'cash gifts accumulate');
assert.equal(separate.goldGiven, 8, 'gold grams accumulate alongside cash');

// The rupee figure on a gold gift is an estimate of the same chain already
// counted in grams, so it must stay out of the cash total.
const valued = totalsOf([
  gift({ id: 'c', direction: 'given', giftKind: 'cash', amount: 5000 }),
  gift({ id: 'g', direction: 'given', giftKind: 'gold', goldGrams: 8, amount: 60000 }),
]);
assert.equal(valued.given, 5000, 'a gold gift’s estimated worth is not cash');
assert.equal(valued.goldGiven, 8, 'the gold is still counted in grams');

// The weight is optional. A gold gift recorded by value alone is counted by
// that value, or it would disappear from every total.
const goldNoWeight = totalsOf([
  gift({ id: 'g', direction: 'given', giftKind: 'gold', goldGrams: 0, amount: 100000 }),
]);
assert.equal(goldNoWeight.given, 100000, 'gold with no weight still counts as value');
assert.equal(goldNoWeight.goldGiven, 0, 'and adds nothing to the gram total');

// The two kinds of gold entry side by side: neither is lost, neither doubled.
const mixedGold = totalsOf([
  gift({ id: 'a', direction: 'given', giftKind: 'gold', goldGrams: 0, amount: 100000 }),
  gift({ id: 'b', direction: 'given', giftKind: 'gold', goldGrams: 8, amount: 100000 }),
  gift({ id: 'c', direction: 'given', giftKind: 'cash', amount: 1200 }),
]);
assert.equal(mixedGold.given, 101200, 'weighed gold is excluded, unweighed gold is not');
assert.equal(mixedGold.goldGiven, 8, 'only the weighed gift adds grams');

// Received works the same way, on the other side of the ledger.
const got = totalsOf([
  gift({ id: 'r', direction: 'received', giftKind: 'gold', goldGrams: 4, amount: 30000 }),
]);
assert.equal(got.received, 0, 'gold worth stays out of the received cash total');
assert.equal(got.goldReceived, 4, 'received gold is counted in grams');

// An item gift has no gram figure, so its rupee value is all it has.
const item = totalsOf([
  gift({ id: 'i', direction: 'given', giftKind: 'item', amount: 1500 }),
]);
assert.equal(item.given, 1500, 'an item gift keeps its rupee value');

console.log('totals: all assertions passed');

// --- wa.me numbers ---

assert.equal(whatsappNumber('+91 98765 43210'), '919876543210', 'spaces and plus are dropped');
assert.equal(whatsappNumber('9876543210'), '919876543210', 'a bare 10-digit number gets +91');
assert.equal(whatsappNumber('09876543210'), '919876543210', 'the trunk 0 is replaced by the country code');
assert.equal(whatsappNumber('0091 98765 43210'), '919876543210', '00 is the other way of writing +');
assert.equal(whatsappNumber('+44 7700 900123'), '447700900123', 'a foreign number keeps its own code');
assert.equal(whatsappNumber('919876543210'), '919876543210', 'a number already in full form is untouched');

assert.equal(whatsappNumber(''), null, 'an empty number has nothing to invite');
assert.equal(whatsappNumber('12345'), null, 'too short to be a phone number');
assert.equal(whatsappNumber('1234567890123456'), null, 'longer than E.164 allows');
assert.equal(whatsappNumber('not a number'), null, 'letters are not a phone number');

console.log('whatsapp numbers: all assertions passed');

console.log('history ordering: all assertions passed');
