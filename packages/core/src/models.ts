export type ProviderName = 'official_api' | 'playwright' | 'cache';

export type NormalizedSearchResult = {
  id: string;
  title: string | null;
  pinterestUrl: string;
  externalUrl: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  domain: string | null;
  rank: number;
  provider: ProviderName;
};

export type SearchResultPage = {
  query: string;
  page: number;
  perPage: number;
  totalAvailable: number | null;
  hasNextPage: boolean;
  degraded: boolean;
  provider: string;
  results: NormalizedSearchResult[];
};

export type SearchOptions = {
  page: number;
  perPage: number;
  maxResults: number;
  timeoutMs?: number;
  traceId?: string;
};

export type ProviderHealth = {
  provider: string;
  ok: boolean;
  degraded: boolean;
  checkedAt: string;
  reason?: string;
};

export type SearchSession = {
  userId: string;
  lastQuery: string;
  normalizedQuery: string;
  currentOffset: number;
  currentPage: number;
  recentResultIds: string[];
  cooldownUntil?: number;
};
