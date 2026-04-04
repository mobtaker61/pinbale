import { mkdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { Worker } from 'bullmq';
import { getConfig } from '@pinbale/config';
import type { AppConfig } from '@pinbale/config';
import { createLogger } from '@pinbale/observability';
import { createRedisClient, RedisCacheService } from '@pinbale/cache';
import { QUEUE_NAMES, type MaterialsJobPayload } from '@pinbale/queue';
import { BaleAdapter, BaleClient, faMessages } from '@pinbale/bale';
import {
  CACHE_KEYS,
  isSafeTopicFolderName,
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

const baleClient = new BaleClient(
  config.BALE_BOT_TOKEN,
  config.BALE_API_BASE_URL ?? 'https://tapi.bale.ai/bot'
);
const bale = new BaleAdapter(baleClient);

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
    'PUBLIC_BASE_URL خالی است؛ ارسال multipart ممکن است از طرف API بله قطع شود. آدرس عمومی API را در .env بگذارید (مثلاً همان URL تونل کلادفلر).'
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
    const rawTopic = job.data.sourceSubfolder;
    const topic =
      rawTopic && isSafeTopicFolderName(rawTopic) ? rawTopic : undefined;

    logger.info(
      { jobId: job.id, requestId, userId, chatId, topic: topic ?? '(root only)' },
      'processing materials job'
    );

    const { root, sent } = resolveLocalImageDirs(process.cwd(), config.LOCAL_IMAGES_DIR);
    logger.info(
      { requestId, imagesRootAbsolute: root, sentDirAbsolute: sent, topic },
      'materials job: resolved paths'
    );
    await mkdir(root, { recursive: true });
    await mkdir(sent, { recursive: true });

    let pending: string[];
    try {
      pending = topic
        ? await listPendingInTopicFolder(root, topic)
        : await listPendingLocalImages(root);
    } catch (err) {
      logger.error({ err, requestId, root }, 'local images listing failed');
      await bale.sendText(chatId, faMessages.noLocalImages);
      return;
    }

    logger.info(
      { requestId, pendingCount: pending.length, imagesRootAbsolute: root, topic },
      'materials job: after list'
    );

    const batch = pickRandomFiles(pending, config.LOCAL_IMAGES_PER_REQUEST);
    if (batch.length === 0) {
      logger.info({ requestId, topic }, 'materials job: pool empty');
      if (topic) {
        await bale.sendText(chatId, faMessages.noLocalImagesInTopic(topic));
      } else {
        await bale.sendText(chatId, faMessages.noLocalImagesRoot);
      }
      await cacheSvc.set(
        CACHE_KEYS.lastMaterialsTopic(userId),
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
        topic
      },
      'materials job: starting send loop'
    );

    let successCount = 0;
    let anyFailed = false;
    for (let i = 0; i < batch.length; i++) {
      const filePath = batch[i]!;
      try {
        const publicUrl = buildPublicImageUrl(config, filePath, root, topic);
        if (publicUrl) {
          logger.info(
            { requestId, index: i + 1, of: batch.length, publicUrl },
            'materials job: sendPhoto by public URL (Bale downloads)'
          );
          await bale.sendPhotoByUrl(chatId, publicUrl);
        } else {
          logger.info(
            { requestId, index: i + 1, of: batch.length, filePath },
            'materials job: calling sendPhotoFromFile (no PUBLIC_BASE_URL)'
          );
          await bale.sendPhotoFromFile(chatId, filePath);
        }
        await moveTopicImageToSent(filePath, sent, topic ?? null);
        successCount += 1;
        logger.info({ requestId, filePath }, 'materials job: photo sent and moved to sent');
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

    logger.info({ requestId, successCount, anyFailed }, 'materials job: loop finished');

    await cacheSvc.set(
      CACHE_KEYS.lastMaterialsTopic(userId),
      { sourceSubfolder: topic ?? null },
      86_400
    );

    if (anyFailed) {
      await bale.sendText(chatId, faMessages.materialsSendFailed);
    }

    if (successCount > 0) {
      await bale.sendMaterialsBatchDoneKeyboard(chatId, faMessages.materialsBatchDone);
    }
  },
  { connection: redis, concurrency: 1 }
);

logger.info('worker started (materials only)');

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
