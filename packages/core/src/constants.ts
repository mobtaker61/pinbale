export const CACHE_KEYS = {
  search: (normalizedQuery: string) => `search:${normalizedQuery}`,
  negativeSearch: (normalizedQuery: string) => `search:negative:${normalizedQuery}`,
  session: (userId: string) => `session:${userId}`,
  providerHealth: (provider: string) => `provider:health:${provider}`,
  userCooldown: (userId: string) => `cooldown:user:${userId}`,
  userRateMinute: (userId: string) => `rate:user:${userId}`,
  ipRateMinute: (ip: string) => `rate:ip:${ip}`,
  idempotency: (key: string) => `idempotency:${key}`,
  /** لیست پوشه‌های انتخاب‌شده برای /list (چند دقیقه) */
  folderPick: (userId: string) => `folderPick:${userId}`,
  /** آخرین موضوع ارسال مواد یا تصاویر برای دکمهٔ «دوباره» */
  lastMaterialsTopic: (userId: string) => `materials:lastTopic:${userId}`,
  /** آخرین شمارهٔ تصویر ارسال‌شده به این کاربر در این موضوع (نام فایل عددی مثل 00042.jpg) */
  materialsSequentialCursor: (userId: string, topic: string) =>
    `materials:seq:${userId}:${topic.replaceAll(':', '_')}`
} as const;
