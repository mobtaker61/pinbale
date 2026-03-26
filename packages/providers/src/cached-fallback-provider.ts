import type {
  PinterestSearchProvider,
  ProviderHealth,
  SearchOptions,
  SearchResultPage
} from '@pinbale/core';
import { CACHE_KEYS, InternalSearchError, normalizeQuery } from '@pinbale/core';
import type { RedisCacheService } from '@pinbale/cache';

export class CachedFallbackProvider implements PinterestSearchProvider {
  constructor(private readonly cache: RedisCacheService) {}

  getName(): string {
    return 'cache';
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.getName(),
      ok: true,
      degraded: true,
      checkedAt: new Date().toISOString()
    };
  }

  async search(query: string, options: SearchOptions): Promise<SearchResultPage> {
    const normalized = normalizeQuery(query);
    const cached = await this.cache.get<SearchResultPage>(CACHE_KEYS.search(normalized));
    if (!cached) {
      throw new InternalSearchError('No cached fallback available');
    }
    return {
      ...cached,
      page: options.page,
      perPage: options.perPage,
      provider: this.getName(),
      degraded: true,
      results: cached.results.map((r) => ({ ...r, provider: 'cache' }))
    };
  }
}
