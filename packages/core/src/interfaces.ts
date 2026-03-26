import type { ProviderHealth, SearchOptions, SearchResultPage } from './models.js';

export interface PinterestSearchProvider {
  search(query: string, options: SearchOptions): Promise<SearchResultPage>;
  healthCheck(): Promise<ProviderHealth>;
  getName(): string;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
}
