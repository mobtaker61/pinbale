import { mkdir } from 'node:fs/promises';
import { Worker } from 'bullmq';
import { getConfig } from '@pinbale/config';
import { createLogger } from '@pinbale/observability';
import { createRedisClient, RedisCacheService, SessionService } from '@pinbale/cache';
import {
  QUEUE_NAMES,
  type MaterialsJobPayload,
  type ProviderHealthPayload,
  type ProviderWarmupPayload,
  type ScreenshotArchivePayload,
  type SearchJobPayload
} from '@pinbale/queue';
import {
  BaleAdapter,
  BaleClient,
  faMessages,
  formatNoResults,
  formatProviderFailure,
  formatResultPage
} from '@pinbale/bale';
import {
  CACHE_KEYS,
  InternalSearchError,
  listPendingLocalImages,
  moveFileToSentDir,
  paginate,
  pickRandomFiles,
  resolveLocalImageDirs,
  validateQuery,
  type SearchResultPage
} from '@pinbale/core';
import { BrowserManager, OfficialApiPinterestProvider, PlaywrightPinterestProvider } from '@pinbale/providers';
import * as Providers from '@pinbale/providers';

const config = getConfig();
const logger = createLogger(config.LOG_LEVEL);
const redis = createRedisClient(config.REDIS_URL);
const cache = new RedisCacheService(redis);
const sessionService = new SessionService(cache, config.SESSION_TTL_SEC);

const baleClient = new BaleClient(
  config.BALE_BOT_TOKEN,
  config.BALE_API_BASE_URL ?? 'https://tapi.bale.ai/bot'
);
const bale = new BaleAdapter(baleClient);

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
const myno = new (
  Providers as unknown as {
    MynoScraperPinterestProvider: new () => {
      getName(): string;
      search: (query: string, options: unknown) => Promise<SearchResultPage>;
      healthCheck: () => Promise<unknown>;
    };
  }
).MynoScraperPinterestProvider();

new Worker<SearchJobPayload & { chatId: string }>(
  QUEUE_NAMES.search,
  async (job) => {
    const { userId, chatId, query, page, requestId } = job.data;
    logger.info({ jobId: job.id, userId, page, requestId }, 'processing search job');

    try {
      const normalized = validateQuery(query, 120, config.bannedKeywords);
      const cacheKey = CACHE_KEYS.search(normalized);

      const cached = await cache.get<SearchResultPage>(cacheKey);
      let pageData: SearchResultPage;
      if (cached) {
        pageData = cached;
      } else {
        pageData = await runProviderChain(normalized, requestId);
        await cache.set(cacheKey, pageData, config.SEARCH_CACHE_TTL_SEC);
      }

      const sliced = slicePage(pageData, page, config.SEARCH_RESULTS_PER_PAGE);
      if (sliced.results.length === 0) {
        await bale.sendText(chatId, formatNoResults(normalized));
      } else {
        const deliveryImageUrl = getDeliveryImageUrl(
          sliced.results[0]?.thumbnailUrl ?? sliced.results[0]?.imageUrl
        );
        await bale.sendResultWithOptionalPhoto(
          chatId,
          formatResultPage(sliced),
          deliveryImageUrl
        );
      }

      await sessionService.set({
        userId,
        lastQuery: normalized,
        normalizedQuery: normalized,
        currentOffset: (page - 1) * config.SEARCH_RESULTS_PER_PAGE,
        currentPage: page,
        recentResultIds: sliced.results.map((r) => r.id)
      });
    } catch (error) {
      logger.error({ err: error, requestId }, 'search job failed');
      await bale.sendText(chatId, formatProviderFailure());
    }
  },
  { connection: redis, concurrency: 8 }
);

new Worker<MaterialsJobPayload>(
  QUEUE_NAMES.materials,
  async (job) => {
    const { chatId, requestId } = job.data;
    const { root, sent } = resolveLocalImageDirs(process.cwd(), config.LOCAL_IMAGES_DIR);
    await mkdir(root, { recursive: true });
    await mkdir(sent, { recursive: true });

    let pending: string[];
    try {
      pending = await listPendingLocalImages(root);
    } catch (err) {
      logger.error({ err, requestId, root }, 'local images listing failed');
      await bale.sendText(chatId, faMessages.noLocalImages);
      return;
    }

    const batch = pickRandomFiles(pending, config.LOCAL_IMAGES_PER_REQUEST);
    if (batch.length === 0) {
      await bale.sendText(chatId, faMessages.noLocalImages);
      return;
    }

    let anyFailed = false;
    for (const filePath of batch) {
      try {
        await bale.sendPhotoFromFile(chatId, filePath);
        await moveFileToSentDir(filePath, sent);
      } catch (err) {
        anyFailed = true;
        logger.error({ err, filePath, requestId }, 'materials: send or move failed');
      }
    }
    if (anyFailed) {
      await bale.sendText(chatId, faMessages.materialsSendFailed);
    }
  },
  { connection: redis, concurrency: 1 }
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

async function runProviderChain(query: string, traceId: string): Promise<SearchResultPage> {
  let lastError: Error | null = null;
  const providers = resolveProviders();
  for (const provider of providers) {
    const started = Date.now();
    try {
      const page = await provider.search(query, {
        page: 1,
        perPage: config.SEARCH_RESULTS_PER_PAGE,
        maxResults: config.SEARCH_RESULTS_MAX,
        traceId
      });
      if (page.results.length === 0 && provider.getName() !== 'cache') {
        logger.warn(
          { provider: provider.getName(), durationMs: Date.now() - started, traceId },
          'provider returned empty'
        );
        lastError = new InternalSearchError('Empty results from provider');
        continue;
      }
      logger.info(
        { provider: provider.getName(), durationMs: Date.now() - started, traceId },
        'provider search success'
      );
      return page;
    } catch (err) {
      lastError = err as Error;
      logger.warn(
        { provider: provider.getName(), err: (err as Error).message, traceId },
        'provider failed'
      );
    }
  }
  throw lastError ?? new InternalSearchError('All providers failed');
}

function resolveProviders() {
  if (config.PINTEREST_PROVIDER_MODE === 'official') return [official, myno];
  if (config.PINTEREST_PROVIDER_MODE === 'playwright') return [myno, playwright];
  return [official, myno, playwright];
}

function slicePage(source: SearchResultPage, pageNumber: number, perPage: number): SearchResultPage {
  const total = source.results.length;
  const { start, end, hasNextPage } = paginate(total, pageNumber, perPage);
  return {
    ...source,
    page: pageNumber,
    perPage,
    hasNextPage,
    results: source.results.slice(start, end).map((item, idx) => ({
      ...item,
      rank: start + idx + 1
    }))
  };
}

function getDeliveryImageUrl(imageUrl?: string | null): string | null {
  if (!imageUrl) return null;
  const publicBaseUrl = (config as unknown as { PUBLIC_BASE_URL?: string }).PUBLIC_BASE_URL;
  if (!publicBaseUrl) return imageUrl;
  const proxy = new URL('/media/proxy', publicBaseUrl);
  proxy.searchParams.set('u', imageUrl);
  return proxy.toString();
}
