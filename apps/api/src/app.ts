import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import { buildContainer } from './container.js';
import { registerWebhookRoutes } from './routes/webhook.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerInternalRoutes } from './routes/internal.js';
import { registerLocalMediaRoutes } from './routes/local-media.js';

export async function createApp() {
  const container = buildContainer();
  const app = Fastify({
    logger: {
      level: container.config.LOG_LEVEL
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId'
  });

  app.decorate('container', container);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Pinbale API',
        version: '1.0.0'
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(rateLimit, {
    global: true,
    max: container.config.RATE_LIMIT_PER_IP_PER_MIN,
    timeWindow: '1 minute',
    allowList: (req) => {
      const pathOnly = req.url.split('?')[0] ?? '';
      return (
        pathOnly.startsWith('/media/local/') || pathOnly.startsWith('/media/instagram/')
      );
    }
  });

  await registerWebhookRoutes(app);
  await registerHealthRoutes(app);
  await registerInternalRoutes(app);
  await registerLocalMediaRoutes(app);

  app.addHook('onClose', async () => {
    await container.redis.quit();
  });

  return app;
}
