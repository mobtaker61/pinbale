import 'dotenv/config';
import { Worker } from 'bullmq';
import { getConfig } from '@pinbale/config';
import { createLogger } from '@pinbale/observability';
import { createRedisClient, RedisCacheService } from '@pinbale/cache';
import {
  QUEUE_NAMES,
  type ProviderHealthPayload,
  type ProviderWarmupPayload,
  type ScreenshotArchivePayload,
  type SearchJobPayload
} from '@pinbale/queue';
import { BrowserManager, OfficialApiPinterestProvider, PlaywrightPinterestProvider } from '@pinbale/providers';

const config = getConfig();
const logger = createLogger(config.LOG_LEVEL);
const redis = createRedisClient(config.REDIS_URL);
const cache = new RedisCacheService(redis);

const browserManager = new BrowserManager({
  headless: config.PLAYWRIGHT_HEADLESS,
  navTimeoutMs: config.PLAYWRIGHT_NAV_TIMEOUT_MS,
  actionTimeoutMs: config.PLAYWRIGHT_ACTION_TIMEOUT_MS,
  maxContexts: config.PLAYWRIGHT_MAX_CONTEXTS,
  artifactsDir: 'playwright-artifacts'
});
const playwright = new PlaywrightPinterestProvider(browserManager, {
  headless: config.PLAYWRIGHT_HEADLESS,
  navTimeoutMs: config.PLAYWRIGHT_NAV_TIMEOUT_MS,
  actionTimeoutMs: config.PLAYWRIGHT_ACTION_TIMEOUT_MS,
  maxContexts: config.PLAYWRIGHT_MAX_CONTEXTS,
  artifactsDir: 'playwright-artifacts'
});
const official = new OfficialApiPinterestProvider({
  baseUrl: config.PINTEREST_API_BASE_URL,
  accessToken: config.PINTEREST_ACCESS_TOKEN,
  timeoutMs: 12000
});

new Worker<SearchJobPayload>(
  QUEUE_NAMES.search,
  async (job) => {
    logger.info({ jobId: job.id, userId: job.data.userId }, 'processing search job');
  },
  { connection: redis, concurrency: 8 }
);

new Worker<ProviderWarmupPayload>(
  QUEUE_NAMES.providerWarmup,
  async (job) => {
    logger.info({ provider: job.data.provider }, 'provider warmup job');
    if (job.data.provider === 'playwright') {
      await browserManager.init();
    }
  },
  { connection: redis, concurrency: 2 }
);

new Worker<ProviderHealthPayload>(
  QUEUE_NAMES.providerHealth,
  async (job) => {
    const health =
      job.data.provider === 'official_api'
        ? await official.healthCheck()
        : await playwright.healthCheck();
    await cache.set(`provider:health:${job.data.provider}`, health, 300);
    logger.info({ provider: job.data.provider, ok: health.ok }, 'provider health checked');
  },
  { connection: redis, concurrency: 2 }
);

new Worker<ScreenshotArchivePayload>(
  QUEUE_NAMES.screenshotArchive,
  async (job) => {
    logger.info({ path: job.data.path, reason: job.data.reason }, 'screenshot archival job received');
  },
  { connection: redis, concurrency: 1 }
);

logger.info('worker started');
