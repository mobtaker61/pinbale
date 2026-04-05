import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  type BaleAdapter,
  CALLBACK_FOLDER_PICK_PREFIX,
  CALLBACK_MATERIALS_AGAIN,
  CALLBACK_OPEN_FOLDER_LIST,
  faMessages,
  formatHelpMessage,
  formatRateLimited,
  formatStartMessage,
  parseBaleTextCommand
} from '@pinbale/bale';
import {
  CACHE_KEYS,
  type MessengerPlatform,
  RateLimitedError,
  countNumberedImagesInTopic,
  listTopicSubfolders,
  resolveLocalImageDirs
} from '@pinbale/core';
import type { AppConfig } from '@pinbale/config';

const id = z.union([z.string(), z.number()]).transform(String);

const MessengerUpdateSchema = z.object({
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
const MAX_FOLDER_BUTTON_LABEL_CHARS = 58;

function isUserAllowlisted(cfg: AppConfig, platform: MessengerPlatform, userId: string): boolean {
  const list =
    platform === 'bale' ? cfg.allowlistBaleUserIds : cfg.allowlistTelegramUserIds;
  return list.length === 0 || list.includes(userId);
}

function scopedUserId(platform: MessengerPlatform, userId: string): string {
  return `${platform}:${userId}`;
}

function folderButtonLabel(folderName: string, imageCount: number): string {
  const suffix = ` (${imageCount})`;
  if (folderName.length + suffix.length <= MAX_FOLDER_BUTTON_LABEL_CHARS) {
    return `${folderName}${suffix}`;
  }
  const reserve = suffix.length + 1;
  const maxName = MAX_FOLDER_BUTTON_LABEL_CHARS - reserve;
  const trimmed = folderName.slice(0, Math.max(1, maxName));
  return `${trimmed}…${suffix}`;
}

async function enqueueMaterials(
  app: FastifyInstance,
  platform: MessengerPlatform,
  adapter: BaleAdapter,
  userId: string,
  chatId: string,
  requestId: string,
  sourceSubfolder?: string
) {
  await adapter.sendText(chatId, faMessages.materialsQueued);
  await app.container.queues.materialsQueue.add(
    'materials',
    { userId, chatId, requestId, sourceSubfolder, platform },
    { removeOnComplete: true, attempts: 2, backoff: { type: 'exponential', delay: 1000 } }
  );
}

async function sendFolderPicker(
  app: FastifyInstance,
  platform: MessengerPlatform,
  adapter: BaleAdapter,
  chatId: string,
  userId: string
): Promise<void> {
  const { root } = resolveLocalImageDirs(process.cwd(), app.container.config.LOCAL_IMAGES_DIR);
  let folders: string[];
  try {
    folders = await listTopicSubfolders(root);
  } catch {
    await adapter.sendText(chatId, faMessages.listFoldersEmpty);
    return;
  }
  if (folders.length === 0) {
    await adapter.sendText(chatId, faMessages.listFoldersEmpty);
    return;
  }
  const shown = folders.slice(0, MAX_FOLDER_BUTTONS);
  await app.container.cache.set(
    CACHE_KEYS.folderPick(platform, userId),
    folders,
    FOLDER_PICK_TTL_SEC
  );

  const counts = await Promise.all(
    shown.map((name) => countNumberedImagesInTopic(root, name).catch(() => 0))
  );

  const rows = shown.map((name, i) => {
    const label = folderButtonLabel(name, counts[i] ?? 0);
    return [{ text: label, callbackData: `${CALLBACK_FOLDER_PICK_PREFIX}${i}` }];
  });
  let intro = faMessages.listFoldersIntro;
  if (folders.length > MAX_FOLDER_BUTTONS) {
    intro += `\n(فقط ${MAX_FOLDER_BUTTONS} مورد اول؛ برای بقیه نام پوشه را کوتاه‌تر کنید یا بعداً توسعه دهید.)`;
  }
  await adapter.sendTextWithInlineKeyboard(chatId, intro, rows);
}

type MessengerWebhookContext = {
  platform: MessengerPlatform;
  adapter: BaleAdapter;
  validateSecret: (req: FastifyRequest) => boolean;
};

async function handleMessengerWebhook(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: MessengerWebhookContext
): Promise<void> {
  if (!ctx.validateSecret(request)) {
    return reply.code(401).send({ message: faMessages.webhookUnauthorized });
  }

  const update = MessengerUpdateSchema.parse(request.body);
  const { platform, adapter } = ctx;

  const cb = update.callback_query;
  if (cb) {
    const chatId = cb.message?.chat?.id;
    const userId = cb.from.id;
    if (!chatId) {
      return reply.send({ ok: true, ignored: true });
    }

    const rateUser = scopedUserId(platform, userId);

    try {
      await app.container.rateLimitService.checkUser(
        rateUser,
        app.container.config.RATE_LIMIT_PER_USER_PER_MIN
      );
      await app.container.rateLimitService.checkIp(
        request.ip,
        app.container.config.RATE_LIMIT_PER_IP_PER_MIN
      );
    } catch (error) {
      if (error instanceof RateLimitedError) {
        await adapter.answerCallbackQuery(cb.id, faMessages.rateLimited);
        await adapter.sendText(chatId, formatRateLimited());
        return reply.send({ ok: true, limited: true });
      }
      throw error;
    }

    if (!isUserAllowlisted(app.container.config, platform, userId)) {
      await adapter.answerCallbackQuery(cb.id);
      await adapter.sendText(chatId, faMessages.notAllowlisted);
      return reply.send({ ok: true });
    }

    if (cb.data === CALLBACK_MATERIALS_AGAIN) {
      try {
        await adapter.answerCallbackQuery(cb.id, faMessages.callbackAck);
      } catch {
        /* ignore */
      }
      const last = await app.container.cache.get<{ sourceSubfolder: string | null }>(
        CACHE_KEYS.lastMaterialsTopic(platform, userId)
      );
      const sourceSubfolder =
        typeof last?.sourceSubfolder === 'string' && last.sourceSubfolder.length > 0
          ? last.sourceSubfolder
          : undefined;
      await enqueueMaterials(app, platform, adapter, userId, chatId, request.id, sourceSubfolder);
      return reply.send({ ok: true });
    }

    if (cb.data === CALLBACK_OPEN_FOLDER_LIST) {
      try {
        await adapter.answerCallbackQuery(cb.id, faMessages.callbackAck);
      } catch {
        /* ignore */
      }
      await sendFolderPicker(app, platform, adapter, chatId, userId);
      return reply.send({ ok: true });
    }

    if (cb.data?.startsWith(CALLBACK_FOLDER_PICK_PREFIX)) {
      const idx = Number(cb.data.slice(CALLBACK_FOLDER_PICK_PREFIX.length));
      if (Number.isNaN(idx) || idx < 0) {
        await adapter.answerCallbackQuery(cb.id);
        return reply.send({ ok: true, ignored: true });
      }
      const folders = await app.container.cache.get<string[]>(
        CACHE_KEYS.folderPick(platform, userId)
      );
      if (!folders || idx >= folders.length) {
        await adapter.answerCallbackQuery(cb.id, faMessages.folderPickExpired);
        await adapter.sendText(chatId, faMessages.folderPickExpired);
        return reply.send({ ok: true });
      }
      const folderName = folders[idx]!;
      try {
        await adapter.answerCallbackQuery(cb.id, faMessages.callbackAck);
      } catch {
        /* ignore */
      }
      await enqueueMaterials(app, platform, adapter, userId, chatId, request.id, folderName);
      return reply.send({ ok: true });
    }

    await adapter.answerCallbackQuery(cb.id);
    return reply.send({ ok: true, ignored: true });
  }

  const message = update.message;
  if (!message?.text || !message.chat?.id || !message.from?.id) {
    return reply.send({ ok: true, ignored: true });
  }

  const chatId = message.chat.id;
  const userId = message.from.id;
  const rateUser = scopedUserId(platform, userId);

  try {
    await app.container.rateLimitService.checkUser(
      rateUser,
      app.container.config.RATE_LIMIT_PER_USER_PER_MIN
    );
    await app.container.rateLimitService.checkIp(
      request.ip,
      app.container.config.RATE_LIMIT_PER_IP_PER_MIN
    );
  } catch (error) {
    if (error instanceof RateLimitedError) {
      await adapter.sendText(chatId, formatRateLimited());
      return reply.send({ ok: true, limited: true });
    }
    throw error;
  }

  if (!isUserAllowlisted(app.container.config, platform, userId)) {
    await adapter.sendText(chatId, faMessages.notAllowlisted);
    return reply.send({ ok: true });
  }

  const command = parseBaleTextCommand(message.text);
  if (command.type === 'start') {
    await adapter.sendText(chatId, formatStartMessage());
    return reply.send({ ok: true });
  }
  if (command.type === 'help') {
    await adapter.sendText(chatId, formatHelpMessage());
    return reply.send({ ok: true });
  }
  if (command.type === 'listFolders') {
    await sendFolderPicker(app, platform, adapter, chatId, userId);
    return reply.send({ ok: true });
  }
  if (command.type === 'legacySearchCommand') {
    await adapter.sendText(chatId, faMessages.searchDisabled);
    return reply.send({ ok: true });
  }

  await adapter.sendText(chatId, faMessages.useCommandsHint);
  return reply.send({ ok: true });
}

/**
 * بعضی کاربران همان URL بله را در setWebhook تلگرام می‌گذارند.
 * تلگرام با secret_token هدر `x-telegram-bot-api-secret-token` می‌فرستد → همان مسیر، پلتفرم درست.
 * اگر فقط تلگرام فعال باشد (بدون توکن بله)، کل ترافیک این مسیر = تلگرام.
 */
export async function registerWebhookRoutes(app: FastifyInstance) {
  const { messengers, config } = app.container;

  if (messengers.bale || messengers.telegram) {
    app.post('/webhooks/bale', (request, reply) => {
      const tgHeader = request.headers['x-telegram-bot-api-secret-token'];
      const telegramAdapter = messengers.telegram;

      if (
        telegramAdapter &&
        config.TELEGRAM_WEBHOOK_SECRET &&
        tgHeader === config.TELEGRAM_WEBHOOK_SECRET
      ) {
        return handleMessengerWebhook(app, request, reply, {
          platform: 'telegram',
          adapter: telegramAdapter,
          validateSecret: () => true
        });
      }

      if (telegramAdapter && !messengers.bale) {
        return handleMessengerWebhook(app, request, reply, {
          platform: 'telegram',
          adapter: telegramAdapter,
          validateSecret(req) {
            if (!config.TELEGRAM_WEBHOOK_SECRET) return true;
            return req.headers['x-telegram-bot-api-secret-token'] === config.TELEGRAM_WEBHOOK_SECRET;
          }
        });
      }

      const baleAdapter = messengers.bale;
      if (!baleAdapter) {
        return reply.code(404).send({ ok: false, error: 'bale_not_configured' });
      }

      return handleMessengerWebhook(app, request, reply, {
        platform: 'bale',
        adapter: baleAdapter,
        validateSecret(req) {
          if (!config.BALE_WEBHOOK_SECRET) return true;
          return req.headers['x-bale-secret'] === config.BALE_WEBHOOK_SECRET;
        }
      });
    });
  }

  if (messengers.telegram) {
    const telegramAdapter = messengers.telegram;
    app.post('/webhooks/telegram', (request, reply) =>
      handleMessengerWebhook(app, request, reply, {
        platform: 'telegram',
        adapter: telegramAdapter,
        validateSecret(req) {
          if (!config.TELEGRAM_WEBHOOK_SECRET) return true;
          return (
            req.headers['x-telegram-bot-api-secret-token'] === config.TELEGRAM_WEBHOOK_SECRET
          );
        }
      })
    );
  }
}
