import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetch } from 'undici';
import type { InstagramPost } from './types.js';

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;

/**
 * دانلود تصاویر پست‌ها (فقط URL تصویر؛ از thumbnail برای ویدیو هم استفاده می‌شود).
 */
export class InstagramDownloader {
  constructor(
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly maxRetries = MAX_RETRIES
  ) {}

  /**
   * فایل‌ها را در `cacheDir` ذخیره می‌کند: `{username}_{batchTs}_{index}.jpg`
   */
  async downloadAndSave(
    posts: InstagramPost[],
    cacheDir: string,
    username: string
  ): Promise<string[]> {
    await mkdir(cacheDir, { recursive: true });
    const batchTs = Date.now();
    const paths: string[] = [];

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i]!;
      const url = post.imageUrl;
      if (!url) continue;

      const dest = join(cacheDir, `${username}_${batchTs}_${i}.jpg`);
      await this.downloadOne(url, dest);
      paths.push(dest);
    }

    return paths;
  }

  /** حذف فایل‌های قدیمی‌تر از `maxAgeMs` در یک پوشه (به‌صورت best-effort). */
  async cleanupOlderThan(dir: string, maxAgeMs: number): Promise<void> {
    try {
      const names = await readdir(dir);
      const now = Date.now();
      for (const name of names) {
        const full = join(dir, name);
        try {
          const st = await stat(full);
          if (st.isFile() && now - st.mtimeMs > maxAgeMs) {
            await unlink(full);
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* پوشه وجود ندارد */
    }
  }

  private async downloadOne(url: string, destPath: string): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          signal: AbortSignal.timeout(this.timeoutMs)
        });
        if (res.status >= 400) {
          throw new Error(`HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) throw new Error('empty body');
        await writeFile(destPath, buf);
        return;
      } catch (e) {
        lastErr = e;
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}
