export function applyTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3000';
  process.env.LOG_LEVEL = 'silent';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.BALE_BOT_TOKEN = 'test-token';
  process.env.PINTEREST_PROVIDER_MODE = 'hybrid';
  process.env.PLAYWRIGHT_HEADLESS = 'true';
  process.env.PLAYWRIGHT_BROWSER = 'chromium';
  process.env.PLAYWRIGHT_NAV_TIMEOUT_MS = '1000';
  process.env.PLAYWRIGHT_ACTION_TIMEOUT_MS = '1000';
  process.env.PLAYWRIGHT_MAX_CONTEXTS = '1';
  process.env.SEARCH_RESULTS_PER_PAGE = '5';
  process.env.SEARCH_RESULTS_MAX = '20';
  process.env.SEARCH_CACHE_TTL_SEC = '900';
  process.env.SESSION_TTL_SEC = '3600';
  process.env.NEGATIVE_CACHE_TTL_SEC = '120';
  process.env.RATE_LIMIT_PER_USER_PER_MIN = '100';
  process.env.RATE_LIMIT_PER_IP_PER_MIN = '100';
  process.env.QUEUE_GLOBAL_RATE_LIMIT_MAX = '100';
  process.env.QUEUE_GLOBAL_RATE_LIMIT_DURATION_MS = '60000';
  process.env.ADMIN_TOKEN = 'admin-test';
}
