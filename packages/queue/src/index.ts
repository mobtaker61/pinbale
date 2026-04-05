import { Queue } from 'bullmq';
import type { RedisClient } from '@pinbale/cache';
import { QUEUE_NAMES } from './queues.js';
import type { InstagramJobPayload, MaterialsJobPayload } from './jobs.js';

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

  const materialsQueue = new Queue<MaterialsJobPayload>(QUEUE_NAMES.materials, base);
  const instagramQueue = new Queue<InstagramJobPayload>(QUEUE_NAMES.instagram, base);

  return { materialsQueue, instagramQueue };
}

export * from './queues.js';
export * from './jobs.js';
