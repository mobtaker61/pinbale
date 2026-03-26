import { describe, expect, test } from 'vitest';
import { normalizeQuery, validateQuery } from '@pinbale/core';

describe('query validation', () => {
  test('normalizes whitespace and case', () => {
    expect(normalizeQuery('  HeLLo   World  ')).toBe('hello world');
  });

  test('blocks empty query', () => {
    expect(() => validateQuery('   ', 120, [])).toThrowError();
  });

  test('blocks banned keywords', () => {
    expect(() => validateQuery('test adult content', 120, ['adult'])).toThrowError();
  });
});
