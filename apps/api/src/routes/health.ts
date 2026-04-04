import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health/live', async () => ({ ok: true, service: 'pinbale-api', mode: 'local-images' }));

  app.get('/health/ready', async (_, reply) => {
    try {
      await app.container.redis.ping();
      return { ok: true };
    } catch {
      reply.code(503);
      return { ok: false };
    }
  });

  app.get('/health/providers', async () => ({
    ok: true,
    message: 'جستجوی پینترست غیرفعال است؛ فقط ارسال تصاویر محلی از پوشهٔ images.'
  }));
}
