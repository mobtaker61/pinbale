import { basename, join } from 'node:path';
import { unlink } from 'node:fs/promises';
import type { Job } from 'bullmq';
import type { AppConfig } from '@pinbale/config';
import type { Logger } from 'pino';
import type { InstagramJobPayload } from '@pinbale/queue';
import type { BaleAdapter } from '@pinbale/bale';
import { faMessages } from '@pinbale/bale';
import {
  InstagramBlockedError,
  InstagramDownloader,
  InstagramNotFoundError,
  InstagramPrivateError,
  InstagramScraper,
  InstagramScraperError,
  fetchInstagramPostsViaRapidApi,
  probeEgressIp
} from '@pinbale/instagram';
import type { MessengerPlatform } from '@pinbale/core';
import { resolveLocalImageDirs } from '@pinbale/core';
import type { InstagramPost } from '@pinbale/instagram';

const CACHE_SUBDIR = 'instagram-cache';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function processInstagramJob(
  job: Job<InstagramJobPayload>,
  deps: {
    config: AppConfig;
    logger: Logger;
    messengers: Partial<Record<MessengerPlatform, BaleAdapter>>;
  }
): Promise<void> {
  const { chatId, requestId, instagramUsername } = job.data;
  const platform: MessengerPlatform = job.data.platform ?? 'bale';
  const bot = deps.messengers[platform];
  if (!bot) {
    deps.logger.error({ requestId, platform }, 'instagram job: messenger adapter missing');
    return;
  }

  const { root } = resolveLocalImageDirs(process.cwd(), deps.config.LOCAL_IMAGES_DIR);
  const cacheDir = join(root, CACHE_SUBDIR);

  const maxPosts = deps.config.INSTAGRAM_MAX_POSTS;
  const rapidKey = deps.config.INSTAGRAM_RAPIDAPI_KEY?.trim();

  const downloader = new InstagramDownloader();

  try {
    await downloader.cleanupOlderThan(cacheDir, CACHE_MAX_AGE_MS);
  } catch {
    /* ignore */
  }

  let posts: InstagramPost[];

  if (rapidKey) {
    deps.logger.info(
      {
        requestId,
        instagramUsername,
        chatId,
        platform,
        maxPosts,
        rapidApiHost: deps.config.INSTAGRAM_RAPIDAPI_HOST,
        rapidApiPath: deps.config.INSTAGRAM_RAPIDAPI_POSTS_PATH,
        rapidApiMethod: deps.config.INSTAGRAM_RAPIDAPI_HTTP_METHOD
      },
      'instagram job: fetch via RapidAPI'
    );
    try {
      posts = await fetchInstagramPostsViaRapidApi(instagramUsername, maxPosts, {
        apiKey: rapidKey,
        host: deps.config.INSTAGRAM_RAPIDAPI_HOST.trim(),
        postsPath: deps.config.INSTAGRAM_RAPIDAPI_POSTS_PATH.trim(),
        method: deps.config.INSTAGRAM_RAPIDAPI_HTTP_METHOD,
        timeoutMs: deps.config.INSTAGRAM_RAPIDAPI_TIMEOUT_MS,
        postIncludeCount: deps.config.INSTAGRAM_RAPIDAPI_POST_INCLUDE_COUNT
      });
    } catch (err) {
      await handleInstagramFetchError(err, bot, chatId, deps, requestId, instagramUsername);
      return;
    }
  } else {
    let scraper: InstagramScraper;
    try {
      scraper = new InstagramScraper(maxPosts, {
        sessionId: deps.config.INSTAGRAM_SESSION_ID,
        csrfToken: deps.config.INSTAGRAM_CSRF_TOKEN,
        proxyUrl: deps.config.INSTAGRAM_HTTPS_PROXY,
        webRetryMax: deps.config.INSTAGRAM_WEB_RETRY_MAX,
        webRetryBaseMs: deps.config.INSTAGRAM_WEB_RETRY_BASE_MS
      });
    } catch (err) {
      if (err instanceof InstagramScraperError && err.statusHint === 400) {
        deps.logger.error(
          { err: err instanceof Error ? err.message : err, requestId },
          'instagram job: invalid INSTAGRAM_HTTPS_PROXY'
        );
        await bot.sendText(chatId, faMessages.instagramBadProxy);
        return;
      }
      throw err;
    }

    const egress = await probeEgressIp(deps.config.INSTAGRAM_HTTPS_PROXY);
    if (egress.ok) {
      deps.logger.info(
        {
          requestId,
          instagramEgressIp: egress.ip,
          instagramTrafficViaProxy: egress.viaProxy
        },
        'instagram job: egress IP (مسیر ترافیک به اینستاگرام)'
      );
    } else {
      deps.logger.warn(
        {
          requestId,
          err: egress.error,
          instagramTrafficViaProxy: egress.viaProxy
        },
        'instagram job: egress IP probe failed'
      );
    }

    deps.logger.info(
      {
        requestId,
        instagramUsername,
        chatId,
        platform,
        maxPosts,
        hasSession: Boolean(deps.config.INSTAGRAM_SESSION_ID),
        hasCsrf: Boolean(deps.config.INSTAGRAM_CSRF_TOKEN),
        hasProxy: Boolean(deps.config.INSTAGRAM_HTTPS_PROXY)
      },
      'instagram job: start scrape (web_profile_info + fallback)'
    );

    try {
      posts = await scraper.fetchUserPosts(instagramUsername);
    } catch (err) {
      await handleInstagramFetchError(err, bot, chatId, deps, requestId, instagramUsername);
      return;
    }
  }

  try {
    if (posts.length === 0) {
      await bot.sendText(chatId, faMessages.instagramNoPosts);
      deps.logger.info({ requestId, instagramUsername }, 'instagram job: no posts');
      return;
    }

    const downloaded = await downloader.downloadAndSave(posts, cacheDir, instagramUsername);
    if (downloaded.length === 0) {
      await bot.sendText(chatId, faMessages.instagramNoPosts);
      return;
    }

    deps.logger.info(
      { requestId, count: downloaded.length },
      'instagram job: downloaded, sending media'
    );

    for (const dm of downloaded) {
      try {
        const publicUrl = buildPublicInstagramMediaUrl(deps.config, dm.path, instagramUsername);
        if (dm.kind === 'video') {
          if (publicUrl) {
            await bot.sendVideoByUrl(chatId, publicUrl, dm.caption);
          } else {
            await bot.sendVideoFromFile(chatId, dm.path, dm.caption);
          }
        } else if (publicUrl) {
          await bot.sendPhotoByUrl(chatId, publicUrl, dm.caption);
        } else {
          await bot.sendPhotoFromFile(chatId, dm.path, dm.caption);
        }
      } catch (err) {
        deps.logger.warn(
          { err: err instanceof Error ? err.message : err, requestId, filePath: dm.path },
          'instagram job: send one media failed'
        );
      } finally {
        try {
          await unlink(dm.path);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    deps.logger.error(
      { err: err instanceof Error ? err.message : err, requestId, instagramUsername },
      'instagram job: download/send failed'
    );
    await bot.sendText(chatId, faMessages.instagramError);
  }
}

async function handleInstagramFetchError(
  err: unknown,
  bot: BaleAdapter,
  chatId: string,
  deps: { logger: Logger },
  requestId: string,
  instagramUsername: string
): Promise<void> {
  deps.logger.error(
    { err: err instanceof Error ? err.message : err, requestId, instagramUsername },
    'instagram job: fetch failed'
  );
  if (err instanceof InstagramNotFoundError) {
    await bot.sendText(chatId, faMessages.instagramNotFound);
  } else if (err instanceof InstagramPrivateError) {
    await bot.sendText(chatId, faMessages.instagramPrivate);
  } else if (err instanceof InstagramBlockedError) {
    await bot.sendText(chatId, faMessages.instagramBlocked);
  } else if (err instanceof InstagramScraperError && err.statusHint === 429) {
    await bot.sendText(chatId, faMessages.instagramRateLimited);
  } else if (
    err instanceof InstagramScraperError &&
    [302, 401].includes(err.statusHint ?? -1)
  ) {
    await bot.sendText(chatId, faMessages.instagramAccessDenied);
  } else {
    await bot.sendText(chatId, faMessages.instagramError);
  }
}

function buildPublicInstagramMediaUrl(
  cfg: AppConfig,
  filePath: string,
  username: string
): string | null {
  const base = cfg.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!base) return null;
  const name = basename(filePath);
  if (!name) return null;
  const q = new URLSearchParams({ ig: username });
  return `${base}/media/instagram/${encodeURIComponent(name)}?${q.toString()}`;
}
