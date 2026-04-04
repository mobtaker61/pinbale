import { mkdir } from 'node:fs/promises';
import { Worker } from 'bullmq';
import { getConfig } from '@pinbale/config';
import { createLogger } from '@pinbale/observability';
import { createRedisClient } from '@pinbale/cache';
import { QUEUE_NAMES, type MaterialsJobPayload } from '@pinbale/queue';
import { BaleAdapter, BaleClient, faMessages } from '@pinbale/bale';
import {
  listPendingLocalImages,
  moveFileToSentDir,
  pickRandomFiles,
  resolveLocalImageDirs
} from '@pinbale/core';

const config = getConfig();
const logger = createLogger(config.LOG_LEVEL);
const redis = createRedisClient(config.REDIS_URL);

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
    nodeEnv: process.env.NODE_ENV
  },
  'worker boot: مسیرهای تصویر داخل این فرایند (کانتینر همین مسیرها را می‌بیند)'
);

void listPendingLocalImages(dirsAtBoot.root)
  .then((list) => {
    logger.info(
      { pendingImageCount: list.length, imagesRootAbsolute: dirsAtBoot.root },
      'worker boot: تعداد فایل تصویر در پوشهٔ اصلی (بدون sent)'
    );
  })
  .catch((err) => {
    logger.warn(
      { err: err instanceof Error ? err.message : err, imagesRootAbsolute: dirsAtBoot.root },
      'worker boot: خواندن پوشهٔ images ناموفق (دسترسی یا mount را چک کنید)'
    );
  });

new Worker<MaterialsJobPayload>(
  QUEUE_NAMES.materials,
  async (job) => {
    const { chatId, requestId, userId } = job.data;
    logger.info({ jobId: job.id, requestId, userId, chatId }, 'processing materials job');

    const { root, sent } = resolveLocalImageDirs(process.cwd(), config.LOCAL_IMAGES_DIR);
    logger.info(
      { requestId, imagesRootAbsolute: root, sentDirAbsolute: sent },
      'materials job: resolved paths'
    );
    await mkdir(root, { recursive: true });
    await mkdir(sent, { recursive: true });

    let pending: string[];
    try {
      pending = await listPendingLocalImages(root);
    } catch (err) {
      logger.error({ err, requestId, root }, 'local images listing failed');
      await bale.sendText(chatId, faMessages.noLocalImages);
      return;
    }

    logger.info(
      { requestId, pendingCount: pending.length, imagesRootAbsolute: root },
      'materials job: after listPendingLocalImages'
    );

    const batch = pickRandomFiles(pending, config.LOCAL_IMAGES_PER_REQUEST);
    if (batch.length === 0) {
      logger.info({ requestId }, 'materials job: pool empty, sending noLocalImages to user');
      await bale.sendText(chatId, faMessages.noLocalImages);
      return;
    }

    logger.info(
      {
        requestId,
        batchSize: batch.length,
        firstFile: batch[0],
        chatId
      },
      'materials job: starting sendPhotoFromFile loop'
    );

    let successCount = 0;
    let anyFailed = false;
    for (let i = 0; i < batch.length; i++) {
      const filePath = batch[i]!;
      try {
        logger.info(
          { requestId, index: i + 1, of: batch.length, filePath },
          'materials job: calling sendPhotoFromFile'
        );
        await bale.sendPhotoFromFile(chatId, filePath);
        await moveFileToSentDir(filePath, sent);
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

    if (anyFailed) {
      await bale.sendText(chatId, faMessages.materialsSendFailed);
    }

    if (successCount > 0) {
      await bale.sendTextWithAgainButton(chatId, faMessages.materialsBatchDone);
    }
  },
  { connection: redis, concurrency: 1 }
);

logger.info('worker started (materials only)');
