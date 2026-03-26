import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { faMessages } from '@pinbale/bale';

const SearchBody = z.object({
  query: z.string().min(1),
  page: z.number().int().positive().optional()
});

export async function registerInternalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/internal')) return;
    const token = request.headers['x-admin-token'];
    if (token !== app.container.config.ADMIN_TOKEN) {
      return reply.code(401).send({ message: faMessages.internalUnauthorized });
    }
  });

  app.post('/internal/search', async (request) => {
    const body = SearchBody.parse(request.body);
    return app.container.searchService.search(body.query, body.page ?? 1, request.id);
  });

  app.get('/internal/session/:userId', async (request) => {
    const params = z.object({ userId: z.string().min(1) }).parse(request.params);
    return app.container.sessionService.get(params.userId);
  });

  app.post('/internal/requeue-failed', async () => {
    const failed = await app.container.queues.searchQueue.getFailed();
    for (const job of failed) {
      await job.retry();
    }
    return { requeued: failed.length };
  });
}
