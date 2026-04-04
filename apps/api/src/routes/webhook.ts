import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CALLBACK_MATERIALS_AGAIN,
  faMessages,
  formatHelpMessage,
  formatRateLimited,
  formatStartMessage,
  parseBaleTextCommand
} from '@pinbale/bale';
import { RateLimitedError } from '@pinbale/core';

const id = z.union([z.string(), z.number()]).transform(String);

const BaleUpdateSchema = z.object({
  update_id: id,
  message: z
    .object({
      message_id: id,
      text: z.string().optional(),
      from: z.object({ id }).optional(),
      chat: z.object({ id }).optional()
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      from: z.object({ id }),
      message: z
        .object({
          chat: z.object({ id })
        })
        .optional()
    })
    .optional()
});

async function enqueueMaterials(
  app: FastifyInstance,
  userId: string,
  chatId: string,
  requestId: string
) {
  await app.container.bale.sendText(chatId, faMessages.materialsQueued);
  await app.container.queues.materialsQueue.add(
    'materials',
    { userId, chatId, requestId },
    { removeOnComplete: true, attempts: 2, backoff: { type: 'exponential', delay: 1000 } }
  );
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/bale', async (request, reply) => {
    if (app.container.config.BALE_WEBHOOK_SECRET) {
      const secret = request.headers['x-bale-secret'];
      if (secret !== app.container.config.BALE_WEBHOOK_SECRET) {
        return reply.code(401).send({ message: faMessages.webhookUnauthorized });
      }
    }

    const update = BaleUpdateSchema.parse(request.body);

    const cb = update.callback_query;
    if (cb) {
      const chatId = cb.message?.chat?.id;
      const userId = cb.from.id;
      if (!chatId) {
        return { ok: true, ignored: true };
      }

      try {
        await app.container.rateLimitService.checkUser(
          userId,
          app.container.config.RATE_LIMIT_PER_USER_PER_MIN
        );
        await app.container.rateLimitService.checkIp(
          request.ip,
          app.container.config.RATE_LIMIT_PER_IP_PER_MIN
        );
      } catch (error) {
        if (error instanceof RateLimitedError) {
          await app.container.bale.answerCallbackQuery(cb.id, faMessages.rateLimited);
          await app.container.bale.sendText(chatId, formatRateLimited());
          return { ok: true, limited: true };
        }
        throw error;
      }

      if (
        app.container.config.allowlistUserIds.length > 0 &&
        !app.container.config.allowlistUserIds.includes(userId)
      ) {
        await app.container.bale.answerCallbackQuery(cb.id);
        await app.container.bale.sendText(chatId, faMessages.notAllowlisted);
        return { ok: true };
      }

      if (cb.data === CALLBACK_MATERIALS_AGAIN) {
        try {
          await app.container.bale.answerCallbackQuery(cb.id, faMessages.callbackAck);
        } catch {
          /* ignore answer errors */
        }
        await enqueueMaterials(app, userId, chatId, request.id);
        return { ok: true };
      }

      await app.container.bale.answerCallbackQuery(cb.id);
      return { ok: true, ignored: true };
    }

    const message = update.message;
    if (!message?.text || !message.chat?.id || !message.from?.id) {
      return { ok: true, ignored: true };
    }

    const chatId = message.chat.id;
    const userId = message.from.id;
    try {
      await app.container.rateLimitService.checkUser(
        userId,
        app.container.config.RATE_LIMIT_PER_USER_PER_MIN
      );
      await app.container.rateLimitService.checkIp(
        request.ip,
        app.container.config.RATE_LIMIT_PER_IP_PER_MIN
      );
    } catch (error) {
      if (error instanceof RateLimitedError) {
        await app.container.bale.sendText(chatId, formatRateLimited());
        return { ok: true, limited: true };
      }
      throw error;
    }

    if (
      app.container.config.allowlistUserIds.length > 0 &&
      !app.container.config.allowlistUserIds.includes(userId)
    ) {
      await app.container.bale.sendText(chatId, faMessages.notAllowlisted);
      return { ok: true };
    }

    const command = parseBaleTextCommand(message.text);
    if (command.type === 'start') {
      await app.container.bale.sendText(chatId, formatStartMessage());
      return { ok: true };
    }
    if (command.type === 'help') {
      await app.container.bale.sendText(chatId, formatHelpMessage());
      return { ok: true };
    }
    if (command.type === 'materials') {
      await enqueueMaterials(app, userId, chatId, request.id);
      return { ok: true };
    }
    if (command.type === 'legacySearchCommand') {
      await app.container.bale.sendText(chatId, faMessages.searchDisabled);
      return { ok: true };
    }

    await app.container.bale.sendText(chatId, faMessages.useCommandsHint);
    return { ok: true };
  });
}
