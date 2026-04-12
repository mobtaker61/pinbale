import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { isSafeTopicFolderName, resolveLocalImageDirs } from '@pinbale/core';

const LOCAL_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** نام فایل پس از basename؛ مسیر واقعی با resolve چک می‌شود — فقط پسوند و `..` را محدود می‌کنیم تا نام فارسی/عددی مجاز باشد */
function isSafeLocalImageBasename(name: string): boolean {
  if (!name || name.length > 255 || name.includes('..')) return false;
  if (/[\x00-\x1f\x7f]/.test(name)) return false;
  const ext = extname(name).toLowerCase();
  return LOCAL_IMAGE_EXT.has(ext);
}

/** کش اینستاگرام: `{username}_{timestamp}_{index}.jpg|.mp4` */
const SAFE_INSTAGRAM_CACHE = /^[a-zA-Z0-9._-]+\.(jpe?g|mp4)$/i;

const MediaQuerySchema = z.object({
  from: z.string().optional()
});

export async function registerLocalMediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { filename: string }; Querystring: { from?: string } }>(
    '/media/local/:filename',
    async (request, reply) => {
      const raw = basename(request.params.filename);
      if (!isSafeLocalImageBasename(raw)) {
        return reply.code(400).send({ message: 'نام فایل نامعتبر است.' });
      }

      const query = MediaQuerySchema.parse(request.query ?? {});
      const topic = query.from ? basename(query.from) : '';
      if (topic && !isSafeTopicFolderName(topic)) {
        return reply.code(400).send({ message: 'نام موضوع نامعتبر است.' });
      }

      const { root } = resolveLocalImageDirs(process.cwd(), app.container.config.LOCAL_IMAGES_DIR);
      const rootAbs = resolve(root);
      const abs = topic ? resolve(root, topic, raw) : resolve(root, raw);

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
    }
  );

  app.get<{ Params: { filename: string } }>('/media/instagram/:filename', async (request, reply) => {
    const raw = basename(request.params.filename);
    if (!SAFE_INSTAGRAM_CACHE.test(raw)) {
      return reply.code(400).send({ message: 'نام فایل نامعتبر است.' });
    }

    const { root } = resolveLocalImageDirs(process.cwd(), app.container.config.LOCAL_IMAGES_DIR);
    const rootAbs = resolve(root);
    const cacheDir = resolve(root, 'instagram-cache');
    const abs = resolve(cacheDir, raw);

    if (!abs.startsWith(cacheDir + '/') && abs !== cacheDir) {
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
    const mime = lower.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'public, max-age=120');
    return reply.send(createReadStream(abs));
  });
}
