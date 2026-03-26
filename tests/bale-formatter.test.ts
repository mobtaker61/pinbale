import { describe, expect, test } from 'vitest';
import { formatResultPage } from '@pinbale/bale';

describe('bale formatter', () => {
  test('formats result page and next hint', () => {
    const text = formatResultPage({
      query: 'cat',
      page: 1,
      perPage: 5,
      totalAvailable: 10,
      hasNextPage: true,
      degraded: false,
      provider: 'x',
      results: [
        {
          id: '1',
          title: 'Cat idea',
          pinterestUrl: 'https://pinterest.com/pin/1',
          externalUrl: null,
          imageUrl: null,
          thumbnailUrl: null,
          domain: null,
          rank: 1,
          provider: 'official_api'
        }
      ]
    });
    expect(text).toContain('برای دیدن نتایج بعدی /next را بزنید.');
  });
});
