import { CACHE_KEYS, RateLimitedError } from '@pinbale/core';
import type { RedisClient } from './redis.js';

export class RateLimitService {
  constructor(private readonly redis: RedisClient) {}

  async checkPerMinute(key: string, max: number, ttlSec = 60): Promise<number> {
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, ttlSec);
    }
    if (current > max) {
      throw new RateLimitedError();
    }
    return current;
  }

  async checkUser(userId: string, max: number): Promise<number> {
    return this.checkPerMinute(CACHE_KEYS.userRateMinute(userId), max, 60);
  }

  async checkIp(ip: string, max: number): Promise<number> {
    return this.checkPerMinute(CACHE_KEYS.ipRateMinute(ip), max, 60);
  }
}
