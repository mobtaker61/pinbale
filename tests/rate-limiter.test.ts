import { describe, expect, test } from 'vitest';
import { RateLimitService } from '@pinbale/cache';

class FakeRedis {
  private store = new Map<string, number>();
  async incr(key: string) {
    const val = (this.store.get(key) ?? 0) + 1;
    this.store.set(key, val);
    return val;
  }
  async expire() {
    return 1;
  }
}

describe('rate limiter behavior', () => {
  test('throws when limit exceeded', async () => {
    const service = new RateLimitService(new FakeRedis() as never);
    await service.checkPerMinute('x', 1);
    await expect(service.checkPerMinute('x', 1)).rejects.toThrowError();
  });
});
