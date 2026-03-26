import type { FastifyInstance } from 'fastify';
import { CACHE_KEYS } from '@pinbale/core';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health/live', async () => ({ ok: true, service: 'pinbale-api' }));

  app.get('/health/ready', async (_, reply) => {
    try {
      await app.container.redis.ping();
      return { ok: true };
    } catch {
      reply.code(503);
      return { ok: false };
    }
  });

  app.get('/health/providers', async () => {
    const providers = app.container.providers;
    const health = await Promise.all([
      providers.officialProvider.healthCheck(),
      providers.playwrightProvider.healthCheck(),
      providers.cacheProvider.healthCheck()
    ]);
    await Promise.all(
      health.map((h) =>
        app.container.cache.set(CACHE_KEYS.providerHealth(h.provider), h, app.container.config.SEARCH_CACHE_TTL_SEC)
      )
    );
    return { providers: health };
  });
}
