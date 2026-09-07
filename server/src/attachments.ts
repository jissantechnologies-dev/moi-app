import { del, get, put } from '@vercel/blob';
import type { FastifyInstance } from 'fastify';
import { currentUserId } from './auth.ts';

/**
 * Bills and gift photos. The bytes go to a private Blob store; the entry row
 * only carries the id, so an attachment costs the sync a few dozen bytes
 * rather than a megabyte.
 *
 * Every blob is stored under the owner's id, and the download route builds
 * that path from the *authenticated* user rather than from anything the
 * caller sent. So a signed-in user asking for someone else's id simply looks
 * in their own folder and finds nothing — ownership needs no separate check.
 */
const MAX_BYTES = 3 * 1024 * 1024;

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

function pathFor(userId: string, id: string): string {
  return `users/${userId}/${id}`;
}

export function attachmentRoutes(app: FastifyInstance): void {
  // Fastify parses JSON out of the box and nothing else; uploads arrive as raw
  // bytes with the real content type, so those need a parser of their own.
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body)
  );

  app.post('/api/attachments', async (req, reply) => {
    const userId = await currentUserId(req);
    if (!userId) return reply.code(401).send({ error: 'Not signed in.' });

    const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim();
    if (!ALLOWED.has(mime)) {
      return reply.code(415).send({ error: 'That file type is not supported.' });
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return reply.code(400).send({ error: 'The file was empty.' });
    }
    if (body.length > MAX_BYTES) {
      return reply.code(413).send({ error: 'That file is too large.' });
    }

    const id = crypto.randomUUID().replace(/-/g, '');
    const name = String((req.query as any)?.name ?? '').slice(0, 200);

    await put(pathFor(userId, id), body, {
      access: 'private',
      contentType: mime,
      // The id is already unique; a suffix would only make the path
      // unpredictable to the download route.
      addRandomSuffix: false,
    });

    return reply.code(201).send({ id, mime, name, size: body.length });
  });

  app.get('/api/attachments/:id', async (req, reply) => {
    const userId = await currentUserId(req);
    if (!userId) return reply.code(401).send({ error: 'Not signed in.' });

    const id = String((req.params as any)?.id ?? '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      return reply.code(400).send({ error: 'Bad attachment id.' });
    }

    const found = await get(pathFor(userId, id), { access: 'private' }).catch(() => null);
    if (!found || found.statusCode !== 200) {
      return reply.code(404).send({ error: 'Not found.' });
    }

    // Private to this user, so it must never be held in a shared cache.
    reply.header('Content-Type', found.blob.contentType);
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.send(Buffer.from(await new Response(found.stream).arrayBuffer()));
  });

  app.delete('/api/attachments/:id', async (req, reply) => {
    const userId = await currentUserId(req);
    if (!userId) return reply.code(401).send({ error: 'Not signed in.' });

    const id = String((req.params as any)?.id ?? '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      return reply.code(400).send({ error: 'Bad attachment id.' });
    }

    // Deleting something already gone is not an error worth reporting: the
    // client is trying to converge on "this attachment is not there".
    await del(pathFor(userId, id)).catch(() => {});
    return { ok: true };
  });
}
