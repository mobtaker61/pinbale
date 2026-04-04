import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CALLBACK_FOLDER_PICK_PREFIX,
  CALLBACK_MATERIALS_AGAIN,
  CALLBACK_OPEN_FOLDER_LIST,
  faMessages,
  formatHelpMessage,
  formatRateLimited,
  formatStartMessage,
  parseBaleTextCommand
} from '@pinbale/bale';
import { CACHE_KEYS, RateLimitedError, listTopicSubfolders, resolveLocalImageDirs } from '@pinbale/core';

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

const FOLDER_PICK_TTL_SEC = 600;
const MAX_FOLDER_BUTTONS = 30;

async function enqueueMaterials(
  app: FastifyInstance,
  userId: string,
  chatId: string,
  requestId: string,
  sourceSubfolder?: string
) {
  await app.container.bale.sendText(chatId, faMessages.materialsQueued);
  await app.container.queues.materialsQueue.add(
    'materials',
    { userId, chatId, requestId, sourceSubfolder },
    { removeOnComplete: true, attempts: 2, backoff: { type: 'exponential', delay: 1000 } }
  );
}

async function sendFolderPicker(app: FastifyInstance, chatId: string, userId: string): Promise<void> {
  const { root } = resolveLocalImageDirs(process.cwd(), app.container.config.LOCAL_IMAGES_DIR);
  let folders: string[];
  try {
    folders = await listTopicSubfolders(root);
  } catch {
    await app.container.bale.sendText(chatId, faMessages.listFoldersEmpty);
    return;
  }
  if (folders.length === 0) {
    await app.container.bale.sendText(chatId, faMessages.listFoldersEmpty);
    return;
  }
  const shown = folders.slice(0, MAX_FOLDER_BUTTONS);
  await app.container.cache.set(CACHE_KEYS.folderPick(userId), folders, FOLDER_PICK_TTL_SEC);
  const rows = shown.map((name, i) => {
    const label = name.length > 36 ? `${name.slice(0, 34)}…` : name;
    return [{ text: label, callbackData: `${CALLBACK_FOLDER_PICK_PREFIX}${i}` }];
  });
  let intro = faMessages.listFoldersIntro;
  if (folders.length > MAX_FOLDER_BUTTONS) {
    intro += `\n(فقط ${MAX_FOLDER_BUTTONS} مورد اول؛ برای بقیه نام پوشه را کوتاه‌تر کنید یا بعداً توسعه دهید.)`;
  }
  await app.container.bale.sendTextWithInlineKeyboard(chatId, intro, rows);
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
          /* ignore */
        }
        const last = await app.container.cache.get<{ sourceSubfolder: string | null }>(
          CACHE_KEYS.lastMaterialsTopic(userId)
        );
        const sourceSubfolder =
          typeof last?.sourceSubfolder === 'string' && last.sourceSubfolder.length > 0
            ? last.sourceSubfolder
            : undefined;
        await enqueueMaterials(app, userId, chatId, request.id, sourceSubfolder);
        return { ok: true };
      }

      if (cb.data === CALLBACK_OPEN_FOLDER_LIST) {
        try {
          await app.container.bale.answerCallbackQuery(cb.id, faMessages.callbackAck);
        } catch {
          /* ignore */
        }
        await sendFolderPicker(app, chatId, userId);
        return { ok: true };
      }

      if (cb.data?.startsWith(CALLBACK_FOLDER_PICK_PREFIX)) {
        const idx = Number(cb.data.slice(CALLBACK_FOLDER_PICK_PREFIX.length));
        if (Number.isNaN(idx) || idx < 0) {
          await app.container.bale.answerCallbackQuery(cb.id);
          return { ok: true, ignored: true };
        }
        const folders = await app.container.cache.get<string[]>(CACHE_KEYS.folderPick(userId));
        if (!folders || idx >= folders.length) {
          await app.container.bale.answerCallbackQuery(cb.id, faMessages.folderPickExpired);
          await app.container.bale.sendText(chatId, faMessages.folderPickExpired);
          return { ok: true };
        }
        const folderName = folders[idx]!;
        try {
          await app.container.bale.answerCallbackQuery(cb.id, faMessages.callbackAck);
        } catch {
          /* ignore */
        }
        await enqueueMaterials(app, userId, chatId, request.id, folderName);
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
    if (command.type === 'listFolders') {
      await sendFolderPicker(app, chatId, userId);
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
