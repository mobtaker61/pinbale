import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { BrowserProviderConfig } from './types.js';

export class BrowserManager {
  private browser: Browser | null = null;
  private activeContexts = 0;

  constructor(private readonly config: BrowserProviderConfig) {}

  async init(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({
      headless: this.config.headless,
      proxy: this.config.proxy
    });
  }

  async createContext(): Promise<BrowserContext> {
    await this.init();
    while (this.activeContexts >= this.config.maxContexts) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    this.activeContexts += 1;
    return this.browser!.newContext({
      userAgent: this.config.userAgent
    });
  }

  async releaseContext(context: BrowserContext): Promise<void> {
    await context.close();
    this.activeContexts = Math.max(0, this.activeContexts - 1);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.activeContexts = 0;
    }
  }
}
