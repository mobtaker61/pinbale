import { z } from 'zod';
import { loadEnvFiles } from './load-env.js';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),

  REDIS_URL: z.string().min(1),

  BALE_BOT_TOKEN: z.string().min(1),
  BALE_WEBHOOK_SECRET: z.string().optional(),
  BALE_API_BASE_URL: z.string().url().optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),

  PINTEREST_PROVIDER_MODE: z.enum(['official', 'playwright', 'hybrid']).default('hybrid'),
  PINTEREST_API_BASE_URL: z.string().url().optional(),
  PINTEREST_ACCESS_TOKEN: z.string().optional(),

  PLAYWRIGHT_HEADLESS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  PLAYWRIGHT_BROWSER: z.enum(['chromium']).default('chromium'),
  PLAYWRIGHT_NAV_TIMEOUT_MS: z.coerce.number().default(15000),
  PLAYWRIGHT_ACTION_TIMEOUT_MS: z.coerce.number().default(8000),
  PLAYWRIGHT_MAX_CONTEXTS: z.coerce.number().default(4),
  PLAYWRIGHT_PROXY_SERVER: z.string().optional(),
  PLAYWRIGHT_PROXY_USERNAME: z.string().optional(),
  PLAYWRIGHT_PROXY_PASSWORD: z.string().optional(),
  PLAYWRIGHT_USER_AGENT: z.string().optional(),

  SEARCH_RESULTS_PER_PAGE: z.coerce.number().default(5),
  SEARCH_RESULTS_MAX: z.coerce.number().default(20),
  SEARCH_CACHE_TTL_SEC: z.coerce.number().default(900),
  SESSION_TTL_SEC: z.coerce.number().default(3600),
  NEGATIVE_CACHE_TTL_SEC: z.coerce.number().default(120),

  RATE_LIMIT_PER_USER_PER_MIN: z.coerce.number().default(15),
  RATE_LIMIT_PER_IP_PER_MIN: z.coerce.number().default(60),
  QUEUE_GLOBAL_RATE_LIMIT_MAX: z.coerce.number().default(100),
  QUEUE_GLOBAL_RATE_LIMIT_DURATION_MS: z.coerce.number().default(60000),

  ADMIN_TOKEN: z.string().min(1),
  ALLOWLIST_USER_IDS: z.string().optional(),
  BANNED_KEYWORDS: z.string().optional(),

  /** مسیر نسبت به cwd سرویس (مثلاً ریشهٔ monorepo یا /app در داکر) */
  LOCAL_IMAGES_DIR: z.string().default('images'),
  LOCAL_IMAGES_PER_REQUEST: z.coerce.number().min(1).max(50).default(10)
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  allowlistUserIds: string[];
  bannedKeywords: string[];
};

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  loadEnvFiles();
  if (cached) return cached;
  let parsed: z.infer<typeof EnvSchema>;
  try {
    parsed = EnvSchema.parse(process.env);
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error(
        'خطای پیکربندی: فایل .env را در ریشهٔ پروژه بسازید (مثلاً با کپی از .env.example) و حداقل REDIS_URL، BALE_BOT_TOKEN و ADMIN_TOKEN را مقداردهی کنید.'
      );
    }
    throw err;
  }
  cached = {
    ...parsed,
    allowlistUserIds: parsed.ALLOWLIST_USER_IDS
      ? parsed.ALLOWLIST_USER_IDS.split(',').map((i) => i.trim())
      : [],
    bannedKeywords: parsed.BANNED_KEYWORDS
      ? parsed.BANNED_KEYWORDS.split(',').map((i) => i.trim().toLowerCase())
      : []
  };
  return cached;
}
