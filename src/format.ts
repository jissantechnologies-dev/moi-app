import { Entry, Lang } from './types';

/** Indian grouping: 12,34,567 */
export function formatRupees(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
    : last3;
  return (neg ? '-' : '') + 'Rs. ' + grouped;
}

export type Totals = {
  given: number;
  received: number;
  goldGiven: number;
  goldReceived: number;
};

export const emptyTotals = (): Totals => ({
  given: 0,
  received: 0,
  goldGiven: 0,
  goldReceived: 0,
});

/**
 * A gift is counted once, in whichever unit actually records it.
 *
 * A gold gift with a weight is counted in grams, so its rupee figure is only
 * an estimate of that same chain and must stay out of the cash total —
 * otherwise one gift reads as 8 g *and* Rs. 60,000 and the rupee balance means
 * nothing.
 *
 * But the weight is optional. A gold gift entered with a value and no grams is
 * recorded by that value alone, so dropping it would lose the gift from every
 * total. Same reasoning as an 'item' gift, which grams never describe.
 */
export function addToTotals(t: Totals, e: Entry): void {
  const isGold = e.giftKind === 'gold';
  const countedInGrams = isGold && e.goldGrams > 0;
  const cash = countedInGrams ? 0 : e.amount;

  if (e.direction === 'given') {
    t.given += cash;
    t.goldGiven += isGold ? e.goldGrams : 0;
  } else {
    t.received += cash;
    t.goldReceived += isGold ? e.goldGrams : 0;
  }
}

export function totalsOf(entries: Entry[]): Totals {
  const t = emptyTotals();
  for (const e of entries) addToTotals(t, e);
  return t;
}

/** Trims trailing zeros: 8 -> "8", 8.50 -> "8.5". */
export function formatGrams(g: number): string {
  return String(Number(g.toFixed(3)));
}

const MONTHS: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ta: ['ஜன', 'பிப்', 'மார்', 'ஏப்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆக', 'செப்', 'அக்', 'நவ', 'டிச'],
};

export function toISODate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Orders a history by the date of the function. Entries sharing a date fall back
 * to when they were written, so the order never shuffles between renders.
 */
export function sortByDate(entries: Entry[], newestFirst = true): Entry[] {
  const dir = newestFirst ? -1 : 1;
  return [...entries].sort((a, b) => {
    if (a.functionDate !== b.functionDate) {
      return a.functionDate.localeCompare(b.functionDate) * dir;
    }
    return (a.createdAt - b.createdAt) * dir;
  });
}

export type DayCell = { day: number; iso: string } | null;

/**
 * One month laid out as whole Sunday-first weeks, with nulls for the blanks
 * before the 1st and after the last day.
 */
export function monthGrid(year: number, month: number): DayCell[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = new Date(year, month, 1).getDay(); // 0 = Sunday

  const cells: DayCell[] = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: toISODate(new Date(year, month, day)) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Contacts often store "+91 98765 43210" or "(0452) 234-5678". */
export function normalizeNumber(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  // Keep a leading +country code, drop stray plus signs elsewhere.
  return digits.startsWith('+') ? '+' + digits.slice(1).replace(/\+/g, '') : digits.replace(/\+/g, '');
}

/**
 * Turns a stored phone number into the digits wa.me needs: full international
 * form, no plus, no spaces. Returns null when the number cannot be made sense
 * of, which is the signal to hide the invite button rather than open WhatsApp
 * on a wrong number.
 *
 * Numbers in this book are typed however people have them written down, so a
 * local Indian number is assumed when no country code is present — the app is
 * used for Tamil weddings, and 10 digits there means +91. A number that
 * already carries a country code is left alone.
 */
export function whatsappNumber(raw: string, defaultCountry = '91'): string | null {
  const tidied = normalizeNumber(raw);
  const hadPlus = tidied.startsWith('+');
  let digits = tidied.replace(/\D/g, '');
  if (!digits) return null;

  if (!hadPlus) {
    // 00 is the other way of writing +, and a single leading 0 is a domestic
    // trunk prefix that has no place in an international number.
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = defaultCountry + digits.replace(/^0+/, '');
    else if (digits.length === 10) digits = defaultCountry + digits;
  }

  // E.164 allows 15 digits; anything under 8 is too short to be a real number.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function formatDate(iso: string, lang: Lang): string {
  if (!iso) return '';
  const d = fromISODate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[lang][d.getMonth()]} ${d.getFullYear()}`;
}

export function fullName(e: Pick<Entry, 'firstName' | 'lastName'>): string {
  return [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Entries are keyed by phone when present, else by name+place. */
export function personKey(e: Entry): string {
  const phone = e.phone.replace(/\D/g, '');
  if (phone) return 'p:' + phone;
  return 'n:' + (fullName(e) + '|' + e.place).toLowerCase();
}
