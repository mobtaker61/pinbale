import { basename, join } from 'node:path';
import { mkdir, unlink } from 'node:fs/promises';
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
  getMediaItemsForPost,
  probeEgressIp
} from '@pinbale/instagram';
import type { MessengerPlatform } from '@pinbale/core';
import { resolveLocalImageDirs } from '@pinbale/core';
import type { InstagramMediaItem, InstagramPost } from '@pinbale/instagram';

const CACHE_SUBDIR = 'instagram-cache';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function cdnMediaHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '(bad-url)';
  }
}

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

  const downloader = new InstagramDownloader({
    proxyUrl: deps.config.INSTAGRAM_HTTPS_PROXY,
    imageTimeoutMs: 45_000,
    videoTimeoutMs: 120_000,
    maxRetries: 5
  });

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
        postIncludeCount: deps.config.INSTAGRAM_RAPIDAPI_POST_INCLUDE_COUNT,
        postMaxId: deps.config.INSTAGRAM_RAPIDAPI_POST_MAX_ID
      });
      deps.logger.info(
        { requestId, postCount: posts.length },
        'instagram job: RapidAPI OK (لیست پست آماده است)'
      );
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

    if (rapidKey && deps.config.INSTAGRAM_RAPIDAPI_MESSENGER_FETCH_MEDIA) {
      deps.logger.info(
        {
          requestId,
          cdnProxy: Boolean(deps.config.INSTAGRAM_HTTPS_PROXY?.trim()),
          hint: 'بدون پروکسی residential، دانلود از fbcdn روی بسیاری از سرورها fail می‌شود'
        },
        'instagram job: شروع ارسال مدیا RapidAPI'
      );
      const sent = await sendRapidApiPostsByMessengerUrls(
        bot,
        chatId,
        posts,
        downloader,
        cacheDir,
        instagramUsername,
        {
          requestId,
          logger: deps.logger
        }
      );
      if (!sent) {
        await bot.sendText(chatId, faMessages.instagramError);
      }
      return;
    }

    deps.logger.info(
      { requestId, postCount: posts.length },
      'instagram job: دانلود مدیا روی worker (مسیر قدیمی یا INSTAGRAM_RAPIDAPI_MESSENGER_FETCH_MEDIA=false)'
    );

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
    const e = err instanceof Error ? err : new Error(String(err));
    deps.logger.error(
      {
        err: e.message,
        cause: e.cause instanceof Error ? e.cause.message : e.cause,
        requestId,
        instagramUsername
      },
      'instagram job: دانلود روی worker یا ارسال فایل ناموفق (معمولاً reach نداشتن به CDN اینستاگرام)'
    );
    await bot.sendText(chatId, faMessages.instagramError);
  }
}

/** کاروسل: دانلود موازی همهٔ اسلایدها سپس ارسال ترتیبی (کمتر تاخیر و کمتر قطع شدن اتصال). */
async function sendCarouselPostParallel(
  bot: BaleAdapter,
  chatId: string,
  post: InstagramPost,
  items: InstagramMediaItem[],
  downloader: InstagramDownloader,
  cacheDir: string,
  instagramUsername: string,
  batchTs: number,
  carSeq: number,
  ctx: { requestId: string; logger: Logger }
): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  const settled = await Promise.allSettled(
    items.map(async (item, slideIdx) => {
      const ext = item.kind === 'video' ? 'mp4' : 'jpg';
      const dest = join(
        cacheDir,
        `${instagramUsername}_car_${batchTs}_${carSeq}_${slideIdx}.${ext}`
      );
      await downloader.downloadMediaToFile(item.url, dest, item.kind);
      return { slideIdx, dest, item } as const;
    })
  );

  const slides: { slideIdx: number; dest: string; item: InstagramMediaItem }[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === 'fulfilled') {
      slides.push(r.value);
    } else {
      fail += 1;
      ctx.logger.warn(
        {
          err: r.reason instanceof Error ? r.reason.message : r.reason,
          requestId: ctx.requestId,
          slideIndex: i,
          kind: items[i]!.kind
        },
        'instagram job: دانلود یک اسلاید کاروسل ناموفق'
      );
    }
  }
  slides.sort((a, b) => a.slideIdx - b.slideIdx);

  for (const { slideIdx, dest, item } of slides) {
    const cap = slideIdx === 0 ? post.caption?.slice(0, 900) : undefined;
    const host = cdnMediaHost(item.url);
    try {
      if (item.kind === 'video') {
        await bot.sendVideoFromFile(chatId, dest, cap);
      } else {
        await bot.sendPhotoFromFile(chatId, dest, cap);
      }
      ok += 1;
    } catch (sendErr) {
      fail += 1;
      ctx.logger.warn(
        {
          err: sendErr instanceof Error ? sendErr.message : sendErr,
          requestId: ctx.requestId,
          mediaHost: host,
          kind: item.kind,
          slideIndex: slideIdx
        },
        'instagram job: ارسال یک اسلاید کاروسل ناموفق'
      );
    } finally {
      try {
        await unlink(dest);
      } catch {
        /* ignore */
      }
    }
  }
  return { ok, fail };
}

/**
 * ترکیبی: عکس ابتدا با URL به تلگرام/بله؛ ویدیو ابتدا دانلود روی worker + ارسال فایل
 * (CDN ویدیوی IG معمولاً با sendVideo(URL) روی API تلگرام 400 می‌دهد).
 */
async function sendRapidApiPostsByMessengerUrls(
  bot: BaleAdapter,
  chatId: string,
  posts: InstagramPost[],
  downloader: InstagramDownloader,
  cacheDir: string,
  instagramUsername: string,
  ctx: { requestId: string; logger: Logger }
): Promise<boolean> {
  await mkdir(cacheDir, { recursive: true });
  const batchTs = Date.now();
  let ok = 0;
  let fail = 0;
  let mediaIndex = 0;

  const sendAfterLocalDownload = async (
    item: { kind: 'image' | 'video'; url: string },
    cap: string | undefined,
    host: string
  ): Promise<boolean> => {
    mediaIndex += 1;
    const ext = item.kind === 'video' ? 'mp4' : 'jpg';
    const dest = join(cacheDir, `${instagramUsername}_rapid_${batchTs}_${mediaIndex}.${ext}`);
    try {
      await downloader.downloadMediaToFile(item.url, dest, item.kind);
    } catch (dlErr) {
      ctx.logger.warn(
        {
          err: dlErr instanceof Error ? dlErr.message : dlErr,
          requestId: ctx.requestId,
          mediaHost: host,
          kind: item.kind
        },
        'instagram job: دانلود مدیا از CDN برای ارسال فایلی ناموفق'
      );
      return false;
    }
    try {
      if (item.kind === 'video') {
        await bot.sendVideoFromFile(chatId, dest, cap);
      } else {
        await bot.sendPhotoFromFile(chatId, dest, cap);
      }
      ok += 1;
      return true;
    } catch (sendErr) {
      ctx.logger.warn(
        {
          err: sendErr instanceof Error ? sendErr.message : sendErr,
          requestId: ctx.requestId,
          mediaHost: host,
          kind: item.kind
        },
        'instagram job: ارسال فایل محلی (بعد از دانلود) ناموفق'
      );
      return false;
    } finally {
      try {
        await unlink(dest);
      } catch {
        /* ignore */
      }
    }
  };

  for (const post of posts) {
    const items = getMediaItemsForPost(post);
    if (items.length === 0) continue;

    if (items.length > 1) {
      mediaIndex += 1;
      const { ok: co, fail: cf } = await sendCarouselPostParallel(
        bot,
        chatId,
        post,
        items,
        downloader,
        cacheDir,
        instagramUsername,
        batchTs,
        mediaIndex,
        ctx
      );
      ok += co;
      fail += cf;
      continue;
    }

    const item = items[0]!;
    const cap = post.caption?.slice(0, 900);
    const host = cdnMediaHost(item.url);

    if (item.kind === 'video') {
      const fileSent = await sendAfterLocalDownload(item, cap, host);
      if (fileSent) continue;
      try {
        await bot.sendVideoByUrl(chatId, item.url, cap);
        ok += 1;
      } catch (err) {
        fail += 1;
        ctx.logger.warn(
          {
            err: err instanceof Error ? err.message : err,
            requestId: ctx.requestId,
            mediaHost: host,
            kind: 'video'
          },
          'instagram job: ویدیو نه با فایل نه با URL ارسال نشد'
        );
      }
      continue;
    }

    try {
      await bot.sendPhotoByUrl(chatId, item.url, cap);
      ok += 1;
    } catch (err) {
      ctx.logger.info(
        {
          err: err instanceof Error ? err.message : err,
          requestId: ctx.requestId,
          mediaHost: host
        },
        'instagram job: عکس با URL ناموفق، تلاش دانلود+فایل'
      );
      const sent = await sendAfterLocalDownload(item, cap, host);
      if (!sent) {
        fail += 1;
      }
    }
  }

  ctx.logger.info(
    { requestId: ctx.requestId, sentOk: ok, sentFailed: fail },
    'instagram job: پایان ارسال RapidAPI (URL + fallback فایل)'
  );
  return ok > 0;
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
    'instagram job: شکست گرفتن لیست پست (RapidAPI یا اسکرپ)'
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
