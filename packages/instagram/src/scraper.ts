import { createRequire } from 'node:module';
import type { InstagramPost } from './types.js';
import {
  InstagramBlockedError,
  InstagramNotFoundError,
  InstagramPrivateError,
  InstagramScraperError
} from './errors.js';

const require = createRequire(import.meta.url);

type RawProfile = {
  private?: boolean;
  access?: boolean;
  lastPosts?: Array<{
    shortcode: string;
    caption: string | null;
    comments: number;
    likes: number;
    thumbnail: string;
    timestamp: number;
  }> | null;
  user?: { blocked?: boolean };
};

/**
 * Wrapper روی پکیج npm `scraper-instagram` (بدون لاگین).
 * نکته: پکیج رسمی npm نامش `scraper-instagram` است نه `scrape-instagram`.
 */
export class InstagramScraper {
  private readonly maxPosts: number;
  private readonly sessionId?: string;

  constructor(maxPosts = 9, sessionId?: string) {
    this.maxPosts = maxPosts;
    this.sessionId = sessionId?.trim() || undefined;
  }

  /**
   * آخرین پست‌های عمومی پروفایل (تا maxPosts).
   */
  async fetchUserPosts(username: string): Promise<InstagramPost[]> {
    const InstaCtor = require('scraper-instagram') as new () => {
      authBySessionId(id: string): Promise<unknown>;
      getProfile(u: string): Promise<RawProfile>;
    };
    const client = new InstaCtor();

    if (this.sessionId) {
      try {
        await client.authBySessionId(this.sessionId);
      } catch (err: unknown) {
        throw this.mapLibraryError(err);
      }
    }

    let profile: RawProfile;
    try {
      profile = await client.getProfile(username);
    } catch (err: unknown) {
      throw this.mapLibraryError(err);
    }

    if (profile.private === true && profile.access === false) {
      throw new InstagramPrivateError();
    }
    if (profile.user?.blocked === true) {
      throw new InstagramBlockedError();
    }

    const raw = profile.lastPosts;
    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      return [];
    }

    return raw.slice(0, this.maxPosts).map((p) => this.mapPost(p));
  }

  private mapPost(p: {
    shortcode: string;
    caption: string | null;
    likes: number;
    thumbnail: string;
    timestamp: number;
  }): InstagramPost {
    return {
      id: p.shortcode,
      caption: p.caption,
      imageUrl: p.thumbnail ?? null,
      videoUrl: null,
      likes: typeof p.likes === 'number' ? p.likes : 0,
      timestamp: typeof p.timestamp === 'number' ? p.timestamp : 0
    };
  }

  private mapLibraryError(err: unknown): Error {
    const code = typeof err === 'number' ? err : NaN;
    if (code === 404) {
      return new InstagramNotFoundError();
    }
    if (code === 409) {
      return new InstagramBlockedError();
    }
    if (code === 401) {
      return new InstagramScraperError('Instagram returned 401 (session may be required for this resource)', 401);
    }
    if (code === 406) {
      return new InstagramScraperError('Failed to parse Instagram response (406)', 406);
    }
    if (code === 429) {
      return new InstagramScraperError('Instagram rate limit (429)', 429);
    }
    /** ریدایرکت به صفحاتی غیر از URLهای شناخته‌شده توسط کتابخانه (اغلب ضدربات/ورود) */
    if (code === 302) {
      return new InstagramScraperError('Instagram redirect 302 (login wall or bot detection)', 302);
    }
    if (Number.isFinite(code)) {
      return new InstagramScraperError(`Instagram HTTP error: ${code}`, code);
    }
    if (err instanceof Error) {
      return new InstagramScraperError(err.message);
    }
    return new InstagramScraperError(String(err));
  }
}
