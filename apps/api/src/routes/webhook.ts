import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  faMessages,
  formatHelpMessage,
  formatInvalidInput,
  formatProviderFailure,
  formatRateLimited,
  formatSearchingMessage,
  formatStartMessage,
  parseBaleTextCommand
} from '@pinbale/bale';
import { CACHE_KEYS, RateLimitedError, ValidationError, validateQuery } from '@pinbale/core';

const BaleUpdateSchema = z.object({
  update_id: z.union([z.string(), z.number()]).transform(String),
  message: z
    .object({
      message_id: z.union([z.string(), z.number()]).transform(String),
      text: z.string().optional(),
      from: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional(),
      chat: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional()
    })
    .optional()
});

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/bale', async (request, reply) => {
    if (app.container.config.BALE_WEBHOOK_SECRET) {
      const secret = request.headers['x-bale-secret'];
      if (secret !== app.container.config.BALE_WEBHOOK_SECRET) {
        return reply.code(401).send({ message: faMessages.webhookUnauthorized });
      }
    }

    const update = BaleUpdateSchema.parse(request.body);
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

    const session = (await app.container.sessionService.get(userId)) ?? {
      userId,
      lastQuery: '',
      normalizedQuery: '',
      currentOffset: 0,
      currentPage: 1,
      recentResultIds: []
    };

    try {
      let query = session.lastQuery;
      let page = session.currentPage;
      if (command.type === 'search') {
        query = validateQuery(command.query, 120, app.container.config.bannedKeywords);
        const repeatedQuery = session.lastQuery === query;
        if (repeatedQuery) {
          const cooldownSet = await app.container.redis.set(
            CACHE_KEYS.userCooldown(userId),
            String(Date.now()),
            'EX',
            10,
            'NX'
          );
          if (cooldownSet === null) {
            throw new RateLimitedError();
          }
        }
        page = 1;
      } else if (command.type === 'next') {
        page += 1;
      } else if (command.type === 'page') {
        page = command.page;
      }

      await app.container.bale.sendText(chatId, formatSearchingMessage());
      // Important: webhook must respond fast; heavy work runs asynchronously in worker.
      await app.container.queues.searchQueue.add(
        'search',
        { userId, chatId, query, page, requestId: request.id },
        { removeOnComplete: true, attempts: 2, backoff: { type: 'exponential', delay: 1000 } }
      );

      await app.container.sessionService.set({
        userId,
        lastQuery: query,
        normalizedQuery: query,
        currentOffset: (page - 1) * app.container.config.SEARCH_RESULTS_PER_PAGE,
        currentPage: page,
        recentResultIds: session.recentResultIds
      });
      return { ok: true };
    } catch (error) {
      app.log.error({ err: error, requestId: request.id }, 'bale webhook search failed');
      if (error instanceof RateLimitedError) {
        await app.container.bale.sendText(chatId, formatRateLimited());
      } else if (error instanceof ValidationError) {
        await app.container.bale.sendText(chatId, formatInvalidInput());
      } else {
        await app.container.bale.sendText(chatId, formatProviderFailure());
      }
      return { ok: true, degraded: true };
    }
  });
}
