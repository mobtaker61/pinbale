export const CACHE_KEYS = {
  search: (normalizedQuery: string) => `search:${normalizedQuery}`,
  negativeSearch: (normalizedQuery: string) => `search:negative:${normalizedQuery}`,
  session: (userId: string) => `session:${userId}`,
  providerHealth: (provider: string) => `provider:health:${provider}`,
  userCooldown: (userId: string) => `cooldown:user:${userId}`,
  userRateMinute: (userId: string) => `rate:user:${userId}`,
  ipRateMinute: (ip: string) => `rate:ip:${ip}`,
  idempotency: (key: string) => `idempotency:${key}`
} as const;
