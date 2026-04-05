import { getConfig } from '@pinbale/config';
import { createLogger } from '@pinbale/observability';
import { createRedisClient, RateLimitService, RedisCacheService, SessionService } from '@pinbale/cache';
import { createQueues } from '@pinbale/queue';
import { BaleAdapter, BaleClient } from '@pinbale/bale';
import type { MessengerPlatform } from '@pinbale/core';

export type MessengerAdapters = Partial<Record<MessengerPlatform, BaleAdapter>>;

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

  const messengers: MessengerAdapters = {};
  const baleToken = config.BALE_BOT_TOKEN?.trim();
  if (baleToken) {
    messengers.bale = new BaleAdapter(
      new BaleClient(baleToken, config.BALE_API_BASE_URL ?? 'https://tapi.bale.ai/bot')
    );
  }
  const tgToken = config.TELEGRAM_BOT_TOKEN?.trim();
  if (tgToken) {
    messengers.telegram = new BaleAdapter(
      new BaleClient(tgToken, config.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org/bot')
    );
  }

  return {
    config,
    logger,
    redis,
    cache,
    sessionService,
    rateLimitService,
    queues,
    messengers
  };
}
