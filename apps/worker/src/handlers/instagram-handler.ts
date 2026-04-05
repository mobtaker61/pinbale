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
  InstagramScraperError
} from '@pinbale/instagram';
import type { MessengerPlatform } from '@pinbale/core';
import { resolveLocalImageDirs } from '@pinbale/core';

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
  const { chatId, requestId, userId, instagramUsername } = job.data;
  const platform: MessengerPlatform = job.data.platform ?? 'bale';
  const bot = deps.messengers[platform];
  if (!bot) {
    deps.logger.error({ requestId, platform }, 'instagram job: messenger adapter missing');
    return;
  }

  const { root } = resolveLocalImageDirs(process.cwd(), deps.config.LOCAL_IMAGES_DIR);
  const cacheDir = join(root, CACHE_SUBDIR);

  const maxPosts = deps.config.INSTAGRAM_MAX_POSTS;
  const scraper = new InstagramScraper(maxPosts, deps.config.INSTAGRAM_SESSION_ID);
  const downloader = new InstagramDownloader();

  deps.logger.info(
    { requestId, instagramUsername, chatId, platform, maxPosts },
    'instagram job: start scrape'
  );

  try {
    await downloader.cleanupOlderThan(cacheDir, CACHE_MAX_AGE_MS);
  } catch {
    /* ignore */
  }

  try {
    const posts = await scraper.fetchUserPosts(instagramUsername);
    if (posts.length === 0) {
      await bot.sendText(chatId, faMessages.instagramNoPosts);
      deps.logger.info({ requestId, instagramUsername }, 'instagram job: no posts');
      return;
    }

    const paths = await downloader.downloadAndSave(posts, cacheDir, instagramUsername);
    if (paths.length === 0) {
      await bot.sendText(chatId, faMessages.instagramNoPosts);
      return;
    }

    deps.logger.info(
      { requestId, count: paths.length },
      'instagram job: downloaded, sending photos'
    );

    for (let i = 0; i < paths.length; i++) {
      const filePath = paths[i]!;
      const caption = posts[i]?.caption?.slice(0, 900) ?? undefined;
      try {
        const publicUrl = buildPublicInstagramImageUrl(deps.config, filePath, instagramUsername);
        if (publicUrl) {
          await bot.sendPhotoByUrl(chatId, publicUrl, caption);
        } else {
          await bot.sendPhotoFromFile(chatId, filePath, caption);
        }
      } catch (err) {
        deps.logger.warn(
          { err: err instanceof Error ? err.message : err, requestId, filePath },
          'instagram job: send one photo failed'
        );
      } finally {
        try {
          await unlink(filePath);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    deps.logger.error(
      { err: err instanceof Error ? err.message : err, requestId, instagramUsername },
      'instagram job: failed'
    );
    if (err instanceof InstagramNotFoundError) {
      await bot.sendText(chatId, faMessages.instagramNotFound);
    } else if (err instanceof InstagramPrivateError) {
      await bot.sendText(chatId, faMessages.instagramPrivate);
    } else if (err instanceof InstagramBlockedError) {
      await bot.sendText(chatId, faMessages.instagramBlocked);
    } else if (
      err instanceof InstagramScraperError &&
      [302, 401, 429].includes(err.statusHint ?? -1)
    ) {
      await bot.sendText(chatId, faMessages.instagramAccessDenied);
    } else {
      await bot.sendText(chatId, faMessages.instagramError);
    }
  }
}

function buildPublicInstagramImageUrl(
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
