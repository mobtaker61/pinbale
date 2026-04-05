import type { MessengerPlatform } from './platform.js';

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
  folderPick: (platform: MessengerPlatform, userId: string) =>
    `folderPick:${platform}:${userId}`,
  /** آخرین موضوع ارسال مواد یا تصاویر برای دکمهٔ «دوباره» */
  lastMaterialsTopic: (platform: MessengerPlatform, userId: string) =>
    `materials:lastTopic:${platform}:${userId}`,
  /** آخرین شمارهٔ تصویر ارسال‌شده به این کاربر در این موضوع (نام فایل عددی مثل 00042.jpg) */
  materialsSequentialCursor: (platform: MessengerPlatform, userId: string, topic: string) =>
    `materials:seq:${platform}:${userId}:${topic.replaceAll(':', '_')}`
} as const;
