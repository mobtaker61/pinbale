import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveLocalImageDirs } from '@pinbale/core';

/** فقط نام فایل بدون مسیر؛ جلوگیری از path traversal */
const SAFE_BASENAME = /^[a-zA-Z0-9._-]+\.(jpe?g|png|webp|gif)$/i;

export async function registerLocalMediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { filename: string } }>('/media/local/:filename', async (request, reply) => {
    const raw = basename(request.params.filename);
    if (!SAFE_BASENAME.test(raw)) {
      return reply.code(400).send({ message: 'نام فایل نامعتبر است.' });
    }

    const { root } = resolveLocalImageDirs(process.cwd(), app.container.config.LOCAL_IMAGES_DIR);
    const abs = resolve(root, raw);
    const rootAbs = resolve(root);
    if (!abs.startsWith(rootAbs + '/') && abs !== rootAbs) {
      return reply.code(403).send({ message: 'Forbidden' });
    }

    try {
      const st = await stat(abs);
      if (!st.isFile()) {
        return reply.code(404).send({ message: 'Not found' });
      }
    } catch {
      return reply.code(404).send({ message: 'Not found' });
    }

    const lower = raw.toLowerCase();
    const mime = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : lower.endsWith('.gif')
          ? 'image/gif'
          : 'image/jpeg';

    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'public, max-age=120');
    return reply.send(createReadStream(abs));
  });
}
