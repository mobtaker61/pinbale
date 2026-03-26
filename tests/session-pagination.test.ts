import { describe, expect, test } from 'vitest';
import { paginate } from '@pinbale/core';

describe('session pagination logic', () => {
  test('returns stable boundaries', () => {
    expect(paginate(20, 1, 5)).toEqual({ start: 0, end: 5, hasNextPage: true });
    expect(paginate(20, 4, 5)).toEqual({ start: 15, end: 20, hasNextPage: false });
  });
});
