import type { Page } from 'playwright';
import { SELECTORS } from './selector-config.js';
import type { RawCard } from './types.js';

export async function parsePinterestCards(page: Page, max: number): Promise<RawCard[]> {
  const cards = page.locator(SELECTORS.resultCard);
  const count = Math.min(await cards.count(), max * 2);
  const items: RawCard[] = [];

  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    const pinterestUrl = await card
      .locator(SELECTORS.resultLink)
      .first()
      .getAttribute('href')
      .catch(() => null);
    if (!pinterestUrl) continue;

    const title =
      (await card.locator(SELECTORS.resultTitle).first().textContent().catch(() => null))?.trim() ||
      null;
    const imageUrl =
      (await card.locator(SELECTORS.resultImage).first().getAttribute('src').catch(() => null)) ||
      null;
    const externalUrl =
      (await card.locator(SELECTORS.outboundLink).first().getAttribute('href').catch(() => null)) ||
      null;

    const absolute = pinterestUrl.startsWith('http')
      ? pinterestUrl
      : `https://www.pinterest.com${pinterestUrl}`;
    items.push({ pinterestUrl: absolute, title, imageUrl, externalUrl });
    if (items.length >= max) break;
  }

  return items;
}

export async function parsePinterestPinsFromLinks(page: Page, max: number): Promise<RawCard[]> {
  const results = await page.evaluate(
    ({ max }) => {
      const unique = new Set<string>();
      const cards: Array<{
        pinterestUrl: string;
        title: string | null;
        imageUrl: string | null;
        externalUrl: string | null;
      }> = [];

      const anchors = Array.from(document.querySelectorAll('a[href*="/pin/"]')) as HTMLAnchorElement[];
      for (const a of anchors) {
        const href = a.getAttribute('href');
        if (!href) continue;
        const absolute = href.startsWith('http') ? href : `https://www.pinterest.com${href}`;
        if (unique.has(absolute)) continue;
        unique.add(absolute);

        const root = a.closest('[data-test-id="pin"], [data-grid-item]') ?? a;
        const img = (root.querySelector('img') as HTMLImageElement | null) ?? null;
        const imageUrl = img?.getAttribute('src') ?? null;
        const title =
          (img?.getAttribute('alt') ?? null) ||
          (a.getAttribute('aria-label') ?? null) ||
          (a.textContent?.trim() || null);

        // outbound/source link is often not present on search results; keep null by default
        cards.push({ pinterestUrl: absolute, title, imageUrl, externalUrl: null });
        if (cards.length >= max) break;
      }
      return cards;
    },
    { max }
  );

  return results;
}
