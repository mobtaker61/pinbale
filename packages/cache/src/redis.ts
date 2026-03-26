import { Redis } from 'ioredis';

export function createRedisClient(redisUrl: string) {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true
  });
}

export type RedisClient = ReturnType<typeof createRedisClient>;
