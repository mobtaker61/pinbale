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
