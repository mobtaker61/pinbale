import { Queue } from 'bullmq';
import type { RedisClient } from '@pinbale/cache';
import { QUEUE_NAMES } from './queues.js';
import type {
  ProviderHealthPayload,
  ProviderWarmupPayload,
  ScreenshotArchivePayload,
  SearchJobPayload
} from './jobs.js';

export function createQueues(redis: RedisClient, _max?: number, _durationMs?: number) {
  const base = {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 86400, count: 2000 }
    } as const
  };

  const searchQueue = new Queue<SearchJobPayload>(QUEUE_NAMES.search, {
    ...base
  });

  const screenshotQueue = new Queue<ScreenshotArchivePayload>(QUEUE_NAMES.screenshotArchive, base);
  const warmupQueue = new Queue<ProviderWarmupPayload>(QUEUE_NAMES.providerWarmup, base);
  const healthQueue = new Queue<ProviderHealthPayload>(QUEUE_NAMES.providerHealth, base);

  return { searchQueue, screenshotQueue, warmupQueue, healthQueue };
}

export * from './queues.js';
export * from './jobs.js';
