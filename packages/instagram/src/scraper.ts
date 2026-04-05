import { createRequire } from 'node:module';
import type { InstagramPost } from './types.js';
import {
  InstagramBlockedError,
  InstagramNotFoundError,
  InstagramPrivateError,
  InstagramScraperError
} from './errors.js';
import { fetchPostsViaWebProfile, type WebProfileFetchOptions } from './web-profile-fetch.js';

const require = createRequire(import.meta.url);

export type InstagramFetchOptions = WebProfileFetchOptions;

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
 * ابتدا API وب `web_profile_info` (هدر شبیه مرورگر + اختیاری پروکسی/کوکی کامل)،
 * در صورت خطا بازگشت به `scraper-instagram`.
 */
export class InstagramScraper {
  private readonly maxPosts: number;
  private readonly fetchOpts: WebProfileFetchOptions;

  constructor(maxPosts = 9, options: InstagramFetchOptions = {}) {
    this.maxPosts = maxPosts;
    this.fetchOpts = {
      sessionId: options.sessionId?.trim() || undefined,
      csrfToken: options.csrfToken?.trim() || undefined,
      proxyUrl: options.proxyUrl?.trim() || undefined
    };
  }

  /**
   * آخرین پست‌های عمومی پروفایل (تا maxPosts).
   */
  async fetchUserPosts(username: string): Promise<InstagramPost[]> {
    try {
      const posts = await fetchPostsViaWebProfile(username, this.maxPosts, this.fetchOpts);
      const withImage = posts.filter((p) => p.imageUrl);
      if (withImage.length > 0) {
        return withImage;
      }
      if (posts.length === 0) {
        return [];
      }
    } catch (webErr) {
      if (
        webErr instanceof InstagramNotFoundError ||
        webErr instanceof InstagramPrivateError
      ) {
        throw webErr;
      }
      try {
        return await this.fetchViaLegacyLibrary(username);
      } catch {
        throw webErr;
      }
    }

    return this.fetchViaLegacyLibrary(username);
  }

  private async fetchViaLegacyLibrary(username: string): Promise<InstagramPost[]> {
    const InstaCtor = require('scraper-instagram') as new () => {
      authBySessionId(id: string): Promise<unknown>;
      getProfile(u: string): Promise<RawProfile>;
    };
    const client = new InstaCtor();

    if (this.fetchOpts.sessionId) {
      try {
        await client.authBySessionId(this.fetchOpts.sessionId);
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

    return raw.slice(0, this.maxPosts).map((p) => this.mapLegacyPost(p));
  }

  private mapLegacyPost(p: {
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
