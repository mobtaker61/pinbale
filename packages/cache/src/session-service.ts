import { CACHE_KEYS, type SearchSession } from '@pinbale/core';
import type { RedisCacheService } from './cache-service.js';

export class SessionService {
  constructor(
    private readonly cache: RedisCacheService,
    private readonly sessionTtlSec: number
  ) {}

  async get(userId: string): Promise<SearchSession | null> {
    return this.cache.get<SearchSession>(CACHE_KEYS.session(userId));
  }

  async set(session: SearchSession): Promise<void> {
    await this.cache.set(CACHE_KEYS.session(session.userId), session, this.sessionTtlSec);
  }

  async reset(userId: string): Promise<void> {
    await this.cache.del(CACHE_KEYS.session(userId));
  }
}
