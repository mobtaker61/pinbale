import { Redis } from 'ioredis';

export function createRedisClient(redisUrl: string) {
  return new Redis(redisUrl, {
    // BullMQ requires maxRetriesPerRequest to be null.
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });
}

export type RedisClient = ReturnType<typeof createRedisClient>;
