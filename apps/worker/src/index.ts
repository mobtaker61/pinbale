import { mkdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { Worker } from 'bullmq';
import { getConfig } from '@pinbale/config';
import type { AppConfig } from '@pinbale/config';
import { createLogger } from '@pinbale/observability';
import { createRedisClient, RedisCacheService } from '@pinbale/cache';
import {
  QUEUE_NAMES,
  type InstagramJobPayload,
  type MaterialsJobPayload
} from '@pinbale/queue';
import { processInstagramJob } from './handlers/instagram-handler.js';
import { BaleAdapter, BaleClient, faMessages } from '@pinbale/bale';
import {
  CACHE_KEYS,
  type MessengerPlatform,
  isSafeTopicFolderName,
  listNumberedImagesInTopicSorted,
  listPendingInTopicFolder,
  listPendingLocalImages,
  listTopicSubfolders,
  moveTopicImageToSent,
  pickRandomFiles,
  resolveLocalImageDirs
} from '@pinbale/core';

const config = getConfig();
const logger = createLogger(config.LOG_LEVEL);
const redis = createRedisClient(config.REDIS_URL);
const cacheSvc = new RedisCacheService(redis);

const messengers: Partial<Record<MessengerPlatform, BaleAdapter>> = {};
const baleTok = config.BALE_BOT_TOKEN?.trim();
if (baleTok) {
  messengers.bale = new BaleAdapter(
    new BaleClient(baleTok, config.BALE_API_BASE_URL ?? 'https://tapi.bale.ai/bot')
  );
}
const tgTok = config.TELEGRAM_BOT_TOKEN?.trim();
if (tgTok) {
  messengers.telegram = new BaleAdapter(
    new BaleClient(tgTok, config.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org/bot')
  );
}

const dirsAtBoot = resolveLocalImageDirs(process.cwd(), config.LOCAL_IMAGES_DIR);
logger.info(
  {
    cwd: process.cwd(),
    localImagesDirEnv: config.LOCAL_IMAGES_DIR,
    imagesRootAbsolute: dirsAtBoot.root,
    sentDirAbsolute: dirsAtBoot.sent,
    nodeEnv: process.env.NODE_ENV,
    publicBaseUrl: config.PUBLIC_BASE_URL ?? null,
    sendMode: config.PUBLIC_BASE_URL ? 'sendPhoto(URL)' : 'sendPhoto(multipart-fallback)'
  },
  'worker boot: مسیرهای تصویر داخل این فرایند (کانتینر همین مسیرها را می‌بیند)'
);

if (!config.PUBLIC_BASE_URL) {
  logger.warn(
    'PUBLIC_BASE_URL خالی است؛ ارسال multipart ممکن است از طرف API بله/تلگرام قطع شود. آدرس عمومی API را در .env بگذارید (مثلاً همان URL تونل کلادفلر).'
  );
}

void listPendingLocalImages(dirsAtBoot.root)
  .then((list) => {
    logger.info(
      { pendingImageCount: list.length, imagesRootAbsolute: dirsAtBoot.root },
      'worker boot: تعداد فایل تصویر در ریشهٔ images'
    );
  })
  .catch((err) => {
    logger.warn(
      { err: err instanceof Error ? err.message : err, imagesRootAbsolute: dirsAtBoot.root },
      'worker boot: خواندن پوشهٔ images ناموفق (دسترسی یا mount را چک کنید)'
    );
  });

void listTopicSubfolders(dirsAtBoot.root)
  .then((topics) => {
    logger.info({ topicFolderCount: topics.length }, 'worker boot: تعداد پوشهٔ موضوعی');
  })
  .catch(() => undefined);

new Worker<MaterialsJobPayload>(
  QUEUE_NAMES.materials,
  async (job) => {
    const { chatId, requestId, userId } = job.data;
    const platform: MessengerPlatform = job.data.platform ?? 'bale';
    const bot = messengers[platform];
    if (!bot) {
      logger.error(
        { requestId, platform },
        'materials job: توکن این پلتفرم در worker تنظیم نشده — job نادیده گرفته شد'
      );
      return;
    }

    try {
    const rawTopic = job.data.sourceSubfolder;
    const topic =
      rawTopic && isSafeTopicFolderName(rawTopic) ? rawTopic : undefined;

    logger.info(
      {
        jobId: job.id,
        requestId,
        userId,
        chatId,
        platform,
        topic: topic ?? '(root only)'
      },
      'processing materials job'
    );

    const { root, sent } = resolveLocalImageDirs(process.cwd(), config.LOCAL_IMAGES_DIR);
    logger.info(
      { requestId, imagesRootAbsolute: root, sentDirAbsolute: sent, topic },
      'materials job: resolved paths'
    );
    await mkdir(root, { recursive: true });
    await mkdir(sent, { recursive: true });

    let batch: string[] = [];
    /** برای موضوع: شمارهٔ هر فایل در batch؛ ریشه: null و بعد از ارسال به sent منتقل می‌شود */
    let topicPathToNum: Map<string, number> | null = null;
    let cursorKey = '';
    let cursorFloor = 0;
    let sequenceWrapped = false;

    try {
      if (topic) {
        const sorted = await listNumberedImagesInTopicSorted(root, topic);
        const anyInTopic = await listPendingInTopicFolder(root, topic);
        if (sorted.length === 0) {
          logger.info({ requestId, topic }, 'materials job: no numbered images in topic');
          if (anyInTopic.length > 0) {
            await bot.sendText(chatId, faMessages.noNumberedImagesInTopic(topic));
          } else {
            await bot.sendText(chatId, faMessages.noLocalImagesInTopic(topic));
          }
          await cacheSvc.set(
            CACHE_KEYS.lastMaterialsTopic(platform, userId),
            { sourceSubfolder: topic },
            86_400
          );
          return;
        }

        cursorKey = CACHE_KEYS.materialsSequentialCursor(platform, userId, topic);
        const rawLast = await redis.get(cursorKey);
        let lastNumFromRedis = rawLast ? parseInt(rawLast, 10) : 0;
        if (!Number.isFinite(lastNumFromRedis) || lastNumFromRedis < 0) {
          lastNumFromRedis = 0;
        }

        let candidates = sorted.filter((x) => x.num > lastNumFromRedis);
        if (candidates.length === 0) {
          sequenceWrapped = true;
          candidates = sorted;
        }

        const batchMeta = candidates.slice(0, config.LOCAL_IMAGES_PER_REQUEST);
        topicPathToNum = new Map(batchMeta.map((x) => [x.path, x.num]));
        batch = batchMeta.map((x) => x.path);
        cursorFloor = sequenceWrapped ? 0 : lastNumFromRedis;
      } else {
        const pending = await listPendingLocalImages(root);
        logger.info(
          { requestId, pendingCount: pending.length, imagesRootAbsolute: root, topic },
          'materials job: after list (root)'
        );
        batch = pickRandomFiles(pending, config.LOCAL_IMAGES_PER_REQUEST);
      }
    } catch (err) {
      logger.error({ err, requestId, root }, 'local images listing failed');
      await bot.sendText(chatId, faMessages.noLocalImages);
      return;
    }

    if (batch.length === 0) {
      logger.info({ requestId, topic }, 'materials job: pool empty');
      if (topic) {
        await bot.sendText(chatId, faMessages.noLocalImagesInTopic(topic));
      } else {
        await bot.sendText(chatId, faMessages.noLocalImagesRoot);
      }
      await cacheSvc.set(
        CACHE_KEYS.lastMaterialsTopic(platform, userId),
        { sourceSubfolder: topic ?? null },
        86_400
      );
      return;
    }

    logger.info(
      {
        requestId,
        batchSize: batch.length,
        firstFile: batch[0],
        chatId,
        topic,
        sequential: Boolean(topicPathToNum)
      },
      'materials job: starting send loop'
    );

    let successCount = 0;
    let anyFailed = false;
    let cursorAfter = cursorFloor;

    for (let i = 0; i < batch.length; i++) {
      const filePath = batch[i]!;
      try {
        const publicUrl = buildPublicImageUrl(config, filePath, root, topic);
        if (publicUrl) {
          logger.info(
            { requestId, index: i + 1, of: batch.length, publicUrl },
            'materials job: sendPhoto by public URL (client downloads)'
          );
          try {
            await bot.sendPhotoByUrl(chatId, publicUrl);
          } catch (urlErr) {
            logger.warn(
              {
                err: urlErr instanceof Error ? urlErr.message : urlErr,
                requestId,
                filePath,
                publicUrl
              },
              'materials job: sendPhotoByUrl failed, multipart fallback'
            );
            const fallbackStartedAt = Date.now();
            logger.info(
              { requestId, filePath },
              'materials job: fallback sendPhotoFromFile started'
            );
            await bot.sendPhotoFromFile(chatId, filePath);
            logger.info(
              { requestId, filePath, tookMs: Date.now() - fallbackStartedAt },
              'materials job: fallback sendPhotoFromFile finished'
            );
          }
        } else {
          logger.info(
            { requestId, index: i + 1, of: batch.length, filePath },
            'materials job: calling sendPhotoFromFile (no PUBLIC_BASE_URL)'
          );
          await bot.sendPhotoFromFile(chatId, filePath);
        }
        if (topicPathToNum) {
          const n = topicPathToNum.get(filePath);
          if (n !== undefined) {
            cursorAfter = Math.max(cursorAfter, n);
          }
          logger.info({ requestId, filePath }, 'materials job: photo sent (topic, file stays in folder)');
        } else {
          await moveTopicImageToSent(filePath, sent, null);
          logger.info({ requestId, filePath }, 'materials job: photo sent and moved to sent');
        }
        successCount += 1;
      } catch (err) {
        anyFailed = true;
        logger.error(
          {
            err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
            filePath,
            requestId
          },
          'materials: send or move failed'
        );
      }
    }

    if (topic && topicPathToNum) {
      try {
        await redis.set(cursorKey, String(cursorAfter));
      } catch (cursorErr) {
        logger.warn(
          {
            err: cursorErr instanceof Error ? cursorErr.message : cursorErr,
            requestId,
            cursorKey
          },
          'materials job: redis cursor save failed (ادامهٔ job)'
        );
      }
    }

    logger.info({ requestId, successCount, anyFailed }, 'materials job: loop finished');

    try {
      await cacheSvc.set(
        CACHE_KEYS.lastMaterialsTopic(platform, userId),
        { sourceSubfolder: topic ?? null },
        86_400
      );
    } catch (cacheErr) {
      logger.warn(
        {
          err: cacheErr instanceof Error ? cacheErr.message : cacheErr,
          requestId
        },
        'materials job: cacheSvc.set lastMaterialsTopic failed (ادامهٔ job)'
      );
    }

    try {
      if (anyFailed) {
        await bot.sendText(chatId, faMessages.materialsSendFailed);
      }

      if (successCount > 0) {
        if (sequenceWrapped) {
          await bot.sendText(chatId, faMessages.materialsSequenceWrapped);
        }
        await bot.sendMaterialsBatchDoneKeyboard(chatId, faMessages.materialsBatchDone);
      }
    } catch (notifyErr) {
      logger.warn(
        {
          err: notifyErr instanceof Error ? notifyErr.message : notifyErr,
          requestId,
          chatId
        },
        'materials job: اعلان به کاربر ناموفق — job در صف تکمیل شد'
      );
    }
    } catch (fatal) {
      logger.error(
        {
          err:
            fatal instanceof Error
              ? { message: fatal.message, stack: fatal.stack }
              : fatal,
          requestId,
          jobId: job.id,
          platform,
          chatId
        },
        'materials job: خطای غیرمنتظره در handler'
      );
      try {
        await bot.sendText(chatId, faMessages.materialsSendFailed);
      } catch {
        /* ignore */
      }
    } finally {
      logger.info(
        { requestId, jobId: job.id, platform },
        'materials job: handler finished (صفر یا چند عکس؛ worker آمادهٔ job بعدی)'
      );
    }
  },
  { connection: redis, concurrency: 1 }
);

new Worker<InstagramJobPayload>(
  QUEUE_NAMES.instagram,
  async (job) => {
    await processInstagramJob(job, {
      config,
      logger,
      messengers
    });
  },
  { connection: redis, concurrency: 1 }
);

logger.info('worker started (materials + instagram)');

function buildPublicImageUrl(
  cfg: AppConfig,
  filePath: string,
  imagesRoot: string,
  topicSubfolder: string | undefined
): string | null {
  const base = cfg.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!base) return null;
  const name = basename(filePath);
  if (topicSubfolder && isSafeTopicFolderName(topicSubfolder)) {
    const q = new URLSearchParams({ from: topicSubfolder });
    return `${base}/media/local/${encodeURIComponent(name)}?${q.toString()}`;
  }
  return `${base}/media/local/${encodeURIComponent(name)}`;
}
