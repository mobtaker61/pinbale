import type {
  PinterestSearchProvider,
  ProviderHealth,
  SearchOptions,
  SearchResultPage
} from '@pinbale/core';
import { ProviderBlockedError, ProviderTimeoutError } from '@pinbale/core';
import type { BrowserManager } from './playwright/browser-manager.js';
import { detectBlockedState } from './playwright/block-detector.js';
import { saveFailureArtifacts } from './playwright/diagnostics.js';
import { parsePinterestCards } from './playwright/page-parser.js';
import type { BrowserProviderConfig } from './playwright/types.js';

export class PlaywrightPinterestProvider implements PinterestSearchProvider {
  constructor(private readonly browserManager: BrowserManager, private readonly cfg: BrowserProviderConfig) {}

  getName(): string {
    return 'playwright';
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
    const context = await this.browserManager.createContext();
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(this.cfg.navTimeoutMs);
    page.setDefaultTimeout(this.cfg.actionTimeoutMs);
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['font', 'media'].includes(type)) {
        void route.abort();
      } else {
        void route.continue();
      }
    });

    try {
      const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
      await this.retry(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
      }, 2);

      const blocked = await detectBlockedState(page);
      if (blocked) {
        await saveFailureArtifacts(page, this.cfg.artifactsDir, blocked);
        throw new ProviderBlockedError(`Playwright provider blocked: ${blocked}`);
      }

      const cards = await this.retry(async () => parsePinterestCards(page, options.maxResults), 2);
      return {
        query,
        page: options.page,
        perPage: options.perPage,
        totalAvailable: cards.length,
        hasNextPage: cards.length > options.perPage,
        degraded: false,
        provider: this.getName(),
        results: cards.map((card, index) => ({
          id: `${query}-${index}-${card.pinterestUrl}`,
          title: card.title,
          pinterestUrl: card.pinterestUrl,
          externalUrl: card.externalUrl,
          imageUrl: card.imageUrl,
          thumbnailUrl: card.imageUrl,
          domain: card.externalUrl ? new URL(card.externalUrl).hostname : null,
          rank: index + 1,
          provider: 'playwright'
        }))
      };
    } catch (error) {
      if (error instanceof ProviderBlockedError) throw error;
      await saveFailureArtifacts(page, this.cfg.artifactsDir, 'search_failed');
      throw new ProviderTimeoutError((error as Error).message);
    } finally {
      await this.browserManager.releaseContext(context);
    }
  }

  private async retry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        if (attempt >= retries) throw error;
        attempt += 1;
        const jitter = Math.round(Math.random() * 200);
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt + jitter));
      }
    }
  }
}
