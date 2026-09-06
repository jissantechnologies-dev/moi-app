export type Direction = 'given' | 'received';
export type GiftKind = 'cash' | 'gold' | 'item';

/** Purity in carats. 22K is the usual gift gold in India. */
export const CARATS = [24, 22, 18] as const;
export type Carat = (typeof CARATS)[number];

export type Entry = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  place: string;
  /** Date of the function, stored as YYYY-MM-DD. */
  functionDate: string;
  functionName: string;
  direction: Direction;
  giftKind: GiftKind;
  /** Rupee value. For gold/item this is the estimated worth, may be 0. */
  amount: number;
  /** Gold weight in grams. Only meaningful when giftKind is 'gold'. */
  goldGrams: number;
  /** Gold purity in carats. Only meaningful when giftKind is 'gold'. */
  goldCarat: Carat;
  /** Free text: "chain", "pair of bangles", "silver plate", ... */
  giftNote: string;
  notes: string;
  createdAt: number;
  /** Last local edit, in epoch ms. The server resolves conflicts on this. */
  updatedAt: number;
  /**
   * Tombstone. A deleted entry is kept until the server has seen it, otherwise
   * a second device would simply re-upload the row it still has.
   */
  deleted: boolean;
};

export type Lang = 'en' | 'ta';

export type Settings = {
  lang: Lang;
};

/** Fills in fields added after a record was first written. */
export function normalizeEntry(raw: any): Entry {
  return {
    id: String(raw?.id ?? ''),
    firstName: raw?.firstName ?? '',
    lastName: raw?.lastName ?? '',
    phone: raw?.phone ?? '',
    place: raw?.place ?? '',
    functionDate: raw?.functionDate ?? '',
    functionName: raw?.functionName ?? '',
    direction: raw?.direction === 'received' ? 'received' : 'given',
    giftKind:
      raw?.giftKind === 'gold' || raw?.giftKind === 'item' ? raw.giftKind : 'cash',
    amount: Number(raw?.amount) || 0,
    goldGrams: Number(raw?.goldGrams) || 0,
    goldCarat: (CARATS as readonly number[]).includes(Number(raw?.goldCarat))
      ? (Number(raw.goldCarat) as Carat)
      : 22,
    giftNote: raw?.giftNote ?? '',
    notes: raw?.notes ?? '',
    createdAt: Number(raw?.createdAt) || Date.now(),
    updatedAt: Number(raw?.updatedAt) || Number(raw?.createdAt) || Date.now(),
    deleted: Boolean(raw?.deleted),
  };
}
