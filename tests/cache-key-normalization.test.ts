import { describe, expect, test } from 'vitest';
import { CACHE_KEYS, normalizeQuery } from '@pinbale/core';

describe('cache key normalization', () => {
  test('uses normalized key', () => {
    const normalized = normalizeQuery('  CATS   Ideas ');
    expect(CACHE_KEYS.search(normalized)).toBe('search:cats ideas');
  });
});
