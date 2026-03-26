import { describe, expect, test } from 'vitest';
import { RateLimitedError, ValidationError } from '@pinbale/core';

describe('error hierarchy', () => {
  test('validation error code is stable', () => {
    const err = new ValidationError('invalid');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
  });

  test('rate limit error code is stable', () => {
    const err = new RateLimitedError();
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.statusCode).toBe(429);
  });
});
