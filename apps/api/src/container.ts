import { getConfig } from '@pinbale/config';
import { createLogger } from '@pinbale/observability';
import { createRedisClient, RateLimitService, RedisCacheService, SessionService } from '@pinbale/cache';
import { createQueues } from '@pinbale/queue';
import { BaleAdapter, BaleClient } from '@pinbale/bale';
import {
  BrowserManager,
  CachedFallbackProvider,
  OfficialApiPinterestProvider,
  PlaywrightPinterestProvider
} from '@pinbale/providers';
import type { PinterestSearchProvider } from '@pinbale/core';
import { SearchService } from './services/search-service.js';

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

  const officialProvider = new OfficialApiPinterestProvider({
    baseUrl: config.PINTEREST_API_BASE_URL,
    accessToken: config.PINTEREST_ACCESS_TOKEN,
    timeoutMs: 12000
  });
  const browserManager = new BrowserManager({
    headless: config.PLAYWRIGHT_HEADLESS,
    navTimeoutMs: config.PLAYWRIGHT_NAV_TIMEOUT_MS,
    actionTimeoutMs: config.PLAYWRIGHT_ACTION_TIMEOUT_MS,
    maxContexts: config.PLAYWRIGHT_MAX_CONTEXTS,
    userAgent: config.PLAYWRIGHT_USER_AGENT,
    artifactsDir: 'playwright-artifacts',
    proxy: config.PLAYWRIGHT_PROXY_SERVER
      ? {
          server: config.PLAYWRIGHT_PROXY_SERVER,
          username: config.PLAYWRIGHT_PROXY_USERNAME,
          password: config.PLAYWRIGHT_PROXY_PASSWORD
        }
      : undefined
  });
  const playwrightProvider = new PlaywrightPinterestProvider(browserManager, {
    headless: config.PLAYWRIGHT_HEADLESS,
    navTimeoutMs: config.PLAYWRIGHT_NAV_TIMEOUT_MS,
    actionTimeoutMs: config.PLAYWRIGHT_ACTION_TIMEOUT_MS,
    maxContexts: config.PLAYWRIGHT_MAX_CONTEXTS,
    userAgent: config.PLAYWRIGHT_USER_AGENT,
    artifactsDir: 'playwright-artifacts',
    proxy: config.PLAYWRIGHT_PROXY_SERVER
      ? {
          server: config.PLAYWRIGHT_PROXY_SERVER,
          username: config.PLAYWRIGHT_PROXY_USERNAME,
          password: config.PLAYWRIGHT_PROXY_PASSWORD
        }
      : undefined
  });
  const cacheProvider = new CachedFallbackProvider(cache);

  const providerChain = resolveProviderChain(
    config.PINTEREST_PROVIDER_MODE,
    officialProvider,
    playwrightProvider,
    cacheProvider
  );
  const searchService = new SearchService({
    providers: providerChain,
    cache,
    config,
    logger
  });

  return {
    config,
    logger,
    redis,
    cache,
    sessionService,
    rateLimitService,
    queues,
    bale,
    browserManager,
    providers: { officialProvider, playwrightProvider, cacheProvider },
    searchService
  };
}

function resolveProviderChain(
  mode: 'official' | 'playwright' | 'hybrid',
  official: PinterestSearchProvider,
  playwright: PinterestSearchProvider,
  cache: PinterestSearchProvider
): PinterestSearchProvider[] {
  if (mode === 'official') return [official, cache];
  if (mode === 'playwright') return [playwright, cache];
  return [official, playwright, cache];
}
