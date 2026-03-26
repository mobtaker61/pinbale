import {
  CACHE_KEYS,
  InternalSearchError,
  validateQuery,
  paginate,
  type PinterestSearchProvider,
  type SearchResultPage
} from '@pinbale/core';
import type { RedisCacheService } from '@pinbale/cache';
import type { AppConfig } from '@pinbale/config';
import type { Logger } from '@pinbale/observability';

type SearchServiceDeps = {
  providers: PinterestSearchProvider[];
  cache: RedisCacheService;
  config: AppConfig;
  logger: Logger;
};

export class SearchService {
  constructor(private readonly deps: SearchServiceDeps) {}

  async search(query: string, requestedPage = 1, traceId?: string): Promise<SearchResultPage> {
    const normalized = validateQuery(query, 120, this.deps.config.bannedKeywords);
    const cacheKey = CACHE_KEYS.search(normalized);
    const staleCacheKey = `${cacheKey}:stale`;
    const negativeKey = CACHE_KEYS.negativeSearch(normalized);
    const cached = await this.deps.cache.get<SearchResultPage>(cacheKey);
    if (cached) {
      this.deps.logger.info({ normalized, traceId }, 'cache hit');
      return this.slicePage(cached, requestedPage);
    }
    const negative = await this.deps.cache.get<{ reason: string }>(negativeKey);
    if (negative) {
      throw new InternalSearchError('Negative cached query');
    }

    let lastError: Error | null = null;
    for (const provider of this.deps.providers) {
      const started = Date.now();
      try {
        const page = await provider.search(normalized, {
          page: 1,
          perPage: this.deps.config.SEARCH_RESULTS_PER_PAGE,
          maxResults: this.deps.config.SEARCH_RESULTS_MAX,
          traceId
        });
        await this.deps.cache.set(cacheKey, page, this.deps.config.SEARCH_CACHE_TTL_SEC);
        await this.deps.cache.set(staleCacheKey, page, this.deps.config.SEARCH_CACHE_TTL_SEC * 3);
        this.deps.logger.info(
          { provider: provider.getName(), durationMs: Date.now() - started, traceId },
          'provider search success'
        );
        return this.slicePage(page, requestedPage);
      } catch (error) {
        lastError = error as Error;
        this.deps.logger.warn(
          { provider: provider.getName(), err: (error as Error).message, traceId },
          'provider failed, trying fallback'
        );
      }
    }
    await this.deps.cache.set(
      negativeKey,
      { reason: lastError?.message ?? 'unknown' },
      this.deps.config.NEGATIVE_CACHE_TTL_SEC
    );
    const stale = await this.deps.cache.get<SearchResultPage>(staleCacheKey);
    if (stale) {
      return this.slicePage({ ...stale, degraded: true, provider: 'cache-stale' }, requestedPage);
    }
    throw new InternalSearchError(lastError?.message ?? 'All providers failed');
  }

  private slicePage(source: SearchResultPage, pageNumber: number): SearchResultPage {
    const total = source.results.length;
    const perPage = this.deps.config.SEARCH_RESULTS_PER_PAGE;
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
}
