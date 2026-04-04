import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = false;

/**
 * بارگذاری `.env` از ریشهٔ monorepo (همیشه یکسان) و در صورت تفاوت، از cwd.
 * با `override: false` مقادیر از قبل ست‌شده (مثلاً در تست) دست نمی‌خورند.
 */
export function loadEnvFiles(): void {
  if (loaded) return;
  loaded = true;

  const here = dirname(fileURLToPath(import.meta.url));
  const monorepoRootEnv = resolve(here, '../../../.env');
  const cwdEnv = resolve(process.cwd(), '.env');

  if (existsSync(monorepoRootEnv)) {
    config({ path: monorepoRootEnv });
  }
  if (existsSync(cwdEnv) && resolve(cwdEnv) !== resolve(monorepoRootEnv)) {
    config({ path: cwdEnv });
  }
}
