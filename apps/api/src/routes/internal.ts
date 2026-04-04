import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { faMessages } from '@pinbale/bale';

export async function registerInternalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/internal')) return;
    const token = request.headers['x-admin-token'];
    if (token !== app.container.config.ADMIN_TOKEN) {
      return reply.code(401).send({ message: faMessages.internalUnauthorized });
    }
  });

  app.get('/internal/session/:userId', async (request) => {
    const params = z.object({ userId: z.string().min(1) }).parse(request.params);
    return app.container.sessionService.get(params.userId);
  });
}
