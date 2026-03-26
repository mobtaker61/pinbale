import type { CacheStore } from '@pinbale/core';
import { CacheError } from '@pinbale/core';
import type { RedisClient } from './redis.js';

export class RedisCacheService implements CacheStore {
  constructor(private readonly redis: RedisClient) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      throw new CacheError(`Failed to get key ${key}: ${(error as Error).message}`);
    }
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch (error) {
      throw new CacheError(`Failed to set key ${key}: ${(error as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      throw new CacheError(`Failed to delete key ${key}: ${(error as Error).message}`);
    }
  }
}
