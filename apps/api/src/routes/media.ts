import { request as undiciRequest } from 'undici';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

const QuerySchema = z.object({
  u: z.string().url()
});

function isAllowedImageHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host.endsWith('.pinimg.com') ||
    host === 'pinimg.com' ||
    host.endsWith('.pinterest.com') ||
    host === 'pinterest.com'
  );
}

export async function registerMediaRoutes(app: FastifyInstance) {
  app.get('/media/proxy', async (request, reply) => {
    const query = QuerySchema.parse(request.query);
    const target = new URL(query.u);
    if (!isAllowedImageHost(target)) {
      return reply.code(400).send({ message: 'دامنه تصویر مجاز نیست.' });
    }

    const upstream = await undiciRequest(target.toString(), {
      method: 'GET',
      headersTimeout: 12000,
      bodyTimeout: 12000
    });
    if (upstream.statusCode >= 400) {
      return reply.code(502).send({ message: 'دریافت تصویر ناموفق بود.' });
    }

    reply.header(
      'content-type',
      upstream.headers['content-type'] ?? 'image/jpeg'
    );
    reply.header('cache-control', 'public, max-age=3600');
    return reply.send(upstream.body);
  });
}
