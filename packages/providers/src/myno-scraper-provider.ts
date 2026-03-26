import type {
  PinterestSearchProvider,
  ProviderHealth,
  SearchOptions,
  SearchResultPage
} from '@pinbale/core';
import { createRequire } from 'node:module';

type SearchPinsResult = {
  title?: string;
  url?: string;
  image?: string;
  id?: string;
};

type PinDetails = {
  post?: string; // original image url
  title?: string;
  description?: string;
  url?: string;
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
    // Use require() to avoid ESM/CJS interop issues (observed with cheerio default export).
    const require = createRequire(import.meta.url);
    const Pinterest = require('@myno_21/pinterest-scraper') as {
      searchPins: (q: string, o?: { type?: 'image' | 'video'; page?: number }) => Promise<SearchPinsResult[]>;
      getPins: (postId: string) => Promise<PinDetails>;
    };

    const results = await Pinterest.searchPins(query, { type: 'image', page: 1 });

    // Enrich top results by fetching pin details via postId (more reliable for original image).
    const enriched = await enrichWithPinDetails(results.slice(0, options.maxResults), Pinterest.getPins);

    const normalized = enriched
      .filter((r) => Boolean(r.url))
      .map((r, index) => ({
        id: r.id ?? `${query}-${index}-${r.url}`,
        title: r.title ?? null,
        pinterestUrl: r.url!,
        externalUrl: null,
        imageUrl: r.originalImageUrl ?? r.image ?? null,
        thumbnailUrl: r.image ?? r.originalImageUrl ?? null,
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

async function enrichWithPinDetails(
  items: SearchPinsResult[],
  getPins: (postId: string) => Promise<PinDetails>
): Promise<Array<SearchPinsResult & { originalImageUrl?: string | null }>> {
  const out: Array<SearchPinsResult & { originalImageUrl?: string | null }> = [];
  // small concurrency to keep it fast and avoid bursts
  const concurrency = 4;
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx;
      idx += 1;
      const item = items[i]!;
      if (!item.id) {
        out[i] = { ...item, originalImageUrl: null };
        continue;
      }
      try {
        const details = await getPins(item.id);
        out[i] = { ...item, originalImageUrl: details.post ?? null };
      } catch {
        out[i] = { ...item, originalImageUrl: null };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

