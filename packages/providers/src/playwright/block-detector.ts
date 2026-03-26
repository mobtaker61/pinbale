import type { Page } from 'playwright';
import { SELECTORS } from './selector-config.js';

export async function detectBlockedState(page: Page): Promise<string | null> {
  if (await page.locator(SELECTORS.captcha).first().isVisible().catch(() => false)) {
    return 'captcha_detected';
  }
  if (await page.locator(SELECTORS.loginWall).first().isVisible().catch(() => false)) {
    return 'login_wall_detected';
  }
  const body = (await page.locator(SELECTORS.antiBotText).first().innerText().catch(() => ''))
    .toLowerCase()
    .slice(0, 5000);
  if (body.includes('unusual traffic') || body.includes('access denied')) {
    return 'anti_bot_marker_detected';
  }
  return null;
}
