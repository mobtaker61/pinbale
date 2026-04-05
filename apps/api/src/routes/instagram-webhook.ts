import type { FastifyInstance } from 'fastify';
import type { BaleAdapter } from '@pinbale/bale';
import { faMessages } from '@pinbale/bale';
import type { MessengerPlatform } from '@pinbale/core';
import { extractInstagramUsername, InstagramUsernameSchema } from '@pinbale/instagram';

/**
 * اگر متن دستور `/instagram` یا `/ig` باشد، job را در صف می‌گذارد و true برمی‌گرداند.
 */
export async function tryHandleInstagramCommand(
  app: FastifyInstance,
  platform: MessengerPlatform,
  adapter: BaleAdapter,
  text: string,
  userId: string,
  chatId: string,
  requestId: string
): Promise<boolean> {
  const raw = extractInstagramUsername(text);
  if (raw === null) return false;

  if (raw === '') {
    await adapter.sendText(chatId, faMessages.instagramUsageHint);
    return true;
  }

  const parsed = InstagramUsernameSchema.safeParse(raw);
  if (!parsed.success) {
    await adapter.sendText(chatId, faMessages.instagramInvalidUsername);
    return true;
  }

  await adapter.sendText(chatId, faMessages.instagramQueued);
  await app.container.queues.instagramQueue.add(
    'instagram',
    {
      userId,
      chatId,
      requestId,
      instagramUsername: parsed.data,
      platform
    },
    { removeOnComplete: true, attempts: 2, backoff: { type: 'exponential', delay: 1000 } }
  );
  return true;
}
