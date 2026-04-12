import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetch, ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';
import type { InstagramMediaKind } from './types.js';
import type { InstagramPost } from './types.js';
import { getMediaItemsForPost } from './media-items.js';
import { normalizeHttpProxyUrl } from './proxy-url.js';

const DEFAULT_IMAGE_TIMEOUT_MS = 45_000;
const DEFAULT_VIDEO_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 5;

export type InstagramDownloaderOptions = {
  /** تایم‌اوت هر تلاش برای تصویر (CDN اینستاگرام کند است) */
  imageTimeoutMs?: number;
  /** تایم‌اوت هر تلاش برای ویدیو */
  videoTimeoutMs?: number;
  maxRetries?: number;
  /**
   * پروکسی HTTP CONNECT — همان `INSTAGRAM_HTTPS_PROXY`؛ برای دانلود از fbcdn از IP دیتاسنتر.
   */
  proxyUrl?: string | null;
};

export type DownloadedInstagramFile = {
  path: string;
  kind: InstagramMediaKind;
  /** فقط برای اولین رسانهٔ هر پست */
  caption?: string;
};

/**
 * دانلود تصاویر و ویدیوهای پست‌ها (کاروسل: چند فایل به ازای یک پست).
 */
export class InstagramDownloader {
  private readonly imageTimeoutMs: number;
  private readonly videoTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly dispatcher?: Dispatcher;

  constructor(opts: InstagramDownloaderOptions = {}) {
    this.imageTimeoutMs = opts.imageTimeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
    this.videoTimeoutMs = opts.videoTimeoutMs ?? DEFAULT_VIDEO_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const p = opts.proxyUrl?.trim();
    if (p) {
      try {
        this.dispatcher = new ProxyAgent(normalizeHttpProxyUrl(p));
      } catch {
        this.dispatcher = undefined;
      }
    }
  }

  /**
   * یک مدیا را از URL روی دیسک می‌نویسد (مثلاً وقتی تلگرام/بله نمی‌توانند مستقیم از CDN اینستاگرام بگیرند).
   */
  async downloadMediaToFile(
    url: string,
    destPath: string,
    kind: InstagramMediaKind
  ): Promise<void> {
    await this.downloadOne(url, destPath, kind);
  }

  /**
   * فایل‌ها در `cacheDir`: `{username}_{batchTs}_{index}.jpg|mp4`
   */
  async downloadAndSave(
    posts: InstagramPost[],
    cacheDir: string,
    username: string
  ): Promise<DownloadedInstagramFile[]> {
    await mkdir(cacheDir, { recursive: true });
    const batchTs = Date.now();
    const out: DownloadedInstagramFile[] = [];
    let index = 0;

    for (const post of posts) {
      const items = getMediaItemsForPost(post);
      for (let j = 0; j < items.length; j++) {
        const item = items[j]!;
        const ext = item.kind === 'video' ? 'mp4' : 'jpg';
        const dest = join(cacheDir, `${username}_${batchTs}_${index}.${ext}`);
        await this.downloadOne(item.url, dest, item.kind);
        out.push({
          path: dest,
          kind: item.kind,
          caption: j === 0 ? post.caption?.slice(0, 900) : undefined
        });
        index += 1;
      }
    }

    return out;
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

  private async downloadOne(url: string, destPath: string, kind: InstagramMediaKind): Promise<void> {
    const timeout = kind === 'video' ? this.videoTimeoutMs : this.imageTimeoutMs;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9'
        };
        try {
          const host = new URL(url).hostname;
          if (/instagram|fbcdn|cdninstagram/i.test(host)) {
            headers.Referer = 'https://www.instagram.com/';
            headers.Origin = 'https://www.instagram.com';
          }
        } catch {
          /* ignore */
        }
        const res = await fetch(url, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(timeout),
          ...(this.dispatcher ? { dispatcher: this.dispatcher } : {})
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
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}
