import { getConfig } from '@pinbale/config';
import { createLogger } from '@pinbale/observability';
import { createRedisClient, RateLimitService, RedisCacheService, SessionService } from '@pinbale/cache';
import { createQueues } from '@pinbale/queue';
import { BaleAdapter, BaleClient } from '@pinbale/bale';

export function buildContainer() {
  const config = getConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const redis = createRedisClient(config.REDIS_URL);
  const cache = new RedisCacheService(redis);
  const sessionService = new SessionService(cache, config.SESSION_TTL_SEC);
  const rateLimitService = new RateLimitService(redis);
  const queues = createQueues(
    redis,
    config.QUEUE_GLOBAL_RATE_LIMIT_MAX,
    config.QUEUE_GLOBAL_RATE_LIMIT_DURATION_MS
  );
  const baleClient = new BaleClient(
    config.BALE_BOT_TOKEN,
    config.BALE_API_BASE_URL ?? 'https://tapi.bale.ai/bot'
  );
  const bale = new BaleAdapter(baleClient);

  return {
    config,
    logger,
    redis,
    cache,
    sessionService,
    rateLimitService,
    queues,
    bale
  };
}
