import type {
  PinterestSearchProvider,
  ProviderHealth,
  SearchOptions,
  SearchResultPage
} from '@pinbale/core';

type SearchPinsResult = {
  title?: string;
  url?: string;
  image?: string;
  id?: string;
};

export class MynoScraperPinterestProvider implements PinterestSearchProvider {
  getName(): string {
    return 'myno_scraper';
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.getName(),
      ok: true,
      degraded: false,
      checkedAt: new Date().toISOString()
    };
  }

  async search(query: string, options: SearchOptions): Promise<SearchResultPage> {
    // dynamic import keeps this provider optional and avoids bundling issues in ESM builds
    const Pinterest = await import('@myno_21/pinterest-scraper');
    const results = (await Pinterest.searchPins(query, { type: 'image', page: 1 })) as SearchPinsResult[];

    const normalized = results
      .filter((r) => Boolean(r.url))
      .slice(0, options.maxResults)
      .map((r, index) => ({
        id: r.id ?? `${query}-${index}-${r.url}`,
        title: r.title ?? null,
        pinterestUrl: r.url!,
        externalUrl: null,
        imageUrl: r.image ?? null,
        thumbnailUrl: r.image ?? null,
        domain: null,
        rank: index + 1,
        provider: 'myno_scraper' as const
      }));

    return {
      query,
      page: options.page,
      perPage: options.perPage,
      totalAvailable: normalized.length,
      hasNextPage: normalized.length > options.perPage,
      degraded: false,
      provider: this.getName(),
      results: normalized
    };
  }
}

