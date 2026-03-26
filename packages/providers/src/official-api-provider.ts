import type {
  PinterestSearchProvider,
  ProviderHealth,
  SearchOptions,
  SearchResultPage
} from '@pinbale/core';
import { ProviderAuthError, ProviderTimeoutError } from '@pinbale/core';
import { request } from 'undici';

type OfficialProviderConfig = {
  baseUrl?: string;
  accessToken?: string;
  timeoutMs: number;
};

export class OfficialApiPinterestProvider implements PinterestSearchProvider {
  constructor(private readonly config: OfficialProviderConfig) {}

  getName(): string {
    return 'official_api';
  }

  async healthCheck(): Promise<ProviderHealth> {
    const ready = Boolean(this.config.baseUrl && this.config.accessToken);
    return {
      provider: this.getName(),
      ok: ready,
      degraded: !ready,
      checkedAt: new Date().toISOString(),
      reason: ready ? undefined : 'Missing official API credentials'
    };
  }

  async search(query: string, options: SearchOptions): Promise<SearchResultPage> {
    if (!this.config.baseUrl || !this.config.accessToken) {
      throw new ProviderAuthError('Official API credentials not configured');
    }
    const url = new URL('/search/pins', this.config.baseUrl);
    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(options.maxResults));

    const { statusCode, body } = await request(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs
    });
    if (statusCode === 401 || statusCode === 403) {
      throw new ProviderAuthError();
    }
    if (statusCode >= 500) {
      throw new ProviderTimeoutError(`Official API returned ${statusCode}`);
    }

    const payload = (await body.json()) as {
      items?: Array<{
        id: string;
        title?: string;
        link?: string;
        url: string;
        image?: string;
        thumbnail?: string;
      }>;
      total?: number;
    };

    const items = payload.items ?? [];
    return {
      query,
      page: options.page,
      perPage: options.perPage,
      totalAvailable: payload.total ?? items.length,
      hasNextPage: items.length >= options.perPage,
      degraded: false,
      provider: this.getName(),
      results: items.slice(0, options.maxResults).map((item, index) => ({
        id: item.id,
        title: item.title ?? null,
        pinterestUrl: item.url,
        externalUrl: item.link ?? null,
        imageUrl: item.image ?? null,
        thumbnailUrl: item.thumbnail ?? item.image ?? null,
        domain: item.link ? new URL(item.link).hostname : null,
        rank: index + 1,
        provider: 'official_api'
      }))
    };
  }
}
