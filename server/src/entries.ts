import type { FastifyInstance } from 'fastify';
import { currentUserId } from './auth.ts';
import { pool } from './db.ts';

/** Shape sent to and from the app. Mirrors the client's Entry type. */
type WireEntry = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  place: string;
  functionDate: string;
  functionName: string;
  direction: string;
  giftKind: string;
  amount: number;
  goldGrams: number;
  goldCarat: number;
  giftNote: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
};

function toWire(row: any): WireEntry {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    place: row.place,
    functionDate: row.function_date,
    functionName: row.function_name,
    direction: row.direction === 'received' ? 'received' : 'given',
    giftKind:
      row.gift_kind === 'gold' || row.gift_kind === 'item' ? row.gift_kind : 'cash',
    amount: Number(row.amount) || 0,
    goldGrams: Number(row.gold_grams) || 0,
    goldCarat: Number(row.gold_carat) || 22,
    giftNote: row.gift_note,
    notes: row.notes,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    deleted: Boolean(row.deleted),
  };
}

/** Trusts nothing from the wire: every field is coerced to its expected type. */
function clean(raw: any): WireEntry | null {
  const id = String(raw?.id ?? '').trim();
  if (!id || id.length > 200) return null;
  const str = (v: unknown, max = 500) => String(v ?? '').slice(0, max);
  return {
    id,
    firstName: str(raw?.firstName, 200),
    lastName: str(raw?.lastName, 200),
    phone: str(raw?.phone, 50),
    place: str(raw?.place, 200),
    functionDate: str(raw?.functionDate, 20),
    functionName: str(raw?.functionName, 200),
    direction: raw?.direction === 'received' ? 'received' : 'given',
    giftKind:
      raw?.giftKind === 'gold' || raw?.giftKind === 'item' ? raw.giftKind : 'cash',
    amount: Number(raw?.amount) || 0,
    goldGrams: Number(raw?.goldGrams) || 0,
    goldCarat: Number(raw?.goldCarat) || 22,
    giftNote: str(raw?.giftNote, 500),
    notes: str(raw?.notes, 2000),
    createdAt: Number(raw?.createdAt) || Date.now(),
    updatedAt: Number(raw?.updatedAt) || Date.now(),
    deleted: Boolean(raw?.deleted),
  };
}

export function entryRoutes(app: FastifyInstance): void {
  /**
   * One round trip per sync: the client sends what changed locally and the
   * cursor it last saw, and gets back everything the server has since then.
   */
  app.post('/api/sync', async (req, reply) => {
    const userId = await currentUserId(req);
    if (!userId) return reply.code(401).send({ error: 'Not signed in.' });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const since = Number(body.since) || 0;
    const pushed = Array.isArray(body.entries) ? body.entries : [];
    if (pushed.length > 5000) {
      return reply.code(413).send({ error: 'Too many entries in one sync.' });
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      for (const raw of pushed) {
        const e = clean(raw);
        if (!e) continue;
        // Last write wins, compared on updatedAt. An older copy arriving late
        // from a second device is ignored rather than overwriting newer work.
        await db.query(
          `INSERT INTO entries
             (id, user_id, first_name, last_name, phone, place, function_date,
              function_name, direction, gift_kind, amount, gold_grams, gold_carat,
              gift_note, notes, created_at, updated_at, deleted)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (user_id, id) DO UPDATE SET
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             phone = EXCLUDED.phone,
             place = EXCLUDED.place,
             function_date = EXCLUDED.function_date,
             function_name = EXCLUDED.function_name,
             direction = EXCLUDED.direction,
             gift_kind = EXCLUDED.gift_kind,
             amount = EXCLUDED.amount,
             gold_grams = EXCLUDED.gold_grams,
             gold_carat = EXCLUDED.gold_carat,
             gift_note = EXCLUDED.gift_note,
             notes = EXCLUDED.notes,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at,
             deleted = EXCLUDED.deleted
           WHERE entries.updated_at <= EXCLUDED.updated_at`,
          [
            e.id,
            userId,
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
            e.deleted,
          ]
        );
      }

      const changed = await db.query(
        'SELECT * FROM entries WHERE user_id = $1 AND updated_at > $2 ORDER BY updated_at',
        [userId, since]
      );

      await db.query('COMMIT');

      const entries = changed.rows.map(toWire);
      // The cursor is the newest row actually returned, so nothing is skipped
      // if a write lands mid-request.
      const cursor = entries.reduce((max, e) => Math.max(max, e.updatedAt), since);
      return { entries, cursor };
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
  });

  /** Full download, used on a fresh sign-in when there is no local cache. */
  app.get('/api/entries', async (req, reply) => {
    const userId = await currentUserId(req);
    if (!userId) return reply.code(401).send({ error: 'Not signed in.' });

    const found = await pool.query(
      'SELECT * FROM entries WHERE user_id = $1 AND deleted = FALSE ORDER BY created_at DESC',
      [userId]
    );
    const entries = found.rows.map(toWire);
    const cursor = entries.reduce((max, e) => Math.max(max, e.updatedAt), 0);
    return { entries, cursor };
  });

  app.put('/api/settings', async (req, reply) => {
    const userId = await currentUserId(req);
    if (!userId) return reply.code(401).send({ error: 'Not signed in.' });

    const { lang } = (req.body ?? {}) as Record<string, unknown>;
    await pool.query('UPDATE users SET lang = $1 WHERE id = $2', [
      lang === 'ta' ? 'ta' : 'en',
      userId,
    ]);
    return { ok: true };
  });
}
