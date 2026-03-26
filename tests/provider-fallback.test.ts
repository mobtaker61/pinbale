import { describe, expect, test } from 'vitest';
import type { PinterestSearchProvider, SearchOptions, SearchResultPage } from '@pinbale/core';
import { InternalSearchError } from '@pinbale/core';
import { SearchService } from '../apps/api/src/services/search-service.js';

class MemoryCache {
  private map = new Map<string, string>();
  async get<T>(key: string): Promise<T | null> {
    const v = this.map.get(key);
    return v ? (JSON.parse(v) as T) : null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, JSON.stringify(value));
  }
  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
}

class FailProvider implements PinterestSearchProvider {
  getName() {
    return 'fail';
  }
  async healthCheck() {
    return { provider: 'fail', ok: false, degraded: true, checkedAt: new Date().toISOString() };
  }
  async search(): Promise<SearchResultPage> {
    throw new InternalSearchError('failed');
  }
}

class SuccessProvider implements PinterestSearchProvider {
  getName() {
    return 'success';
  }
  async healthCheck() {
    return { provider: 'success', ok: true, degraded: false, checkedAt: new Date().toISOString() };
  }
  async search(query: string, options: SearchOptions): Promise<SearchResultPage> {
    return {
      query,
      page: options.page,
      perPage: options.perPage,
      totalAvailable: 1,
      hasNextPage: false,
      degraded: false,
      provider: 'success',
      results: [
        {
          id: '1',
          title: 'x',
          pinterestUrl: 'https://pinterest.com/pin/1',
          externalUrl: null,
          imageUrl: null,
          thumbnailUrl: null,
          domain: null,
          rank: 1,
          provider: 'official_api'
        }
      ]
    };
  }
}

describe('provider fallback chain', () => {
  test('falls back to next provider', async () => {
    const service = new SearchService({
      providers: [new FailProvider(), new SuccessProvider()],
      cache: new MemoryCache() as never,
      config: {
        SEARCH_RESULTS_PER_PAGE: 5,
        SEARCH_RESULTS_MAX: 20,
        SEARCH_CACHE_TTL_SEC: 300,
        NEGATIVE_CACHE_TTL_SEC: 60,
        bannedKeywords: []
      } as never,
      logger: { info: () => undefined, warn: () => undefined } as never
    });
    const result = await service.search('cats');
    expect(result.provider).toBe('success');
  });
});
