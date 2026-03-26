import 'fastify';
import type { buildContainer } from './container.js';

declare module 'fastify' {
  interface FastifyInstance {
    container: ReturnType<typeof buildContainer>;
  }
}
