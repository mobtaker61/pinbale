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

new Worker<MaterialsJobPayload>(
  QUEUE_NAMES.materials,
  async (job) => {
    const { chatId, requestId } = job.data;
    logger.info({ jobId: job.id, requestId }, 'processing materials job');

    const { root, sent } = resolveLocalImageDirs(process.cwd(), config.LOCAL_IMAGES_DIR);
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

    const batch = pickRandomFiles(pending, config.LOCAL_IMAGES_PER_REQUEST);
    if (batch.length === 0) {
      await bale.sendText(chatId, faMessages.noLocalImages);
      return;
    }

    let successCount = 0;
    let anyFailed = false;
    for (const filePath of batch) {
      try {
        await bale.sendPhotoFromFile(chatId, filePath);
        await moveFileToSentDir(filePath, sent);
        successCount += 1;
      } catch (err) {
        anyFailed = true;
        logger.error({ err, filePath, requestId }, 'materials: send or move failed');
      }
    }

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
