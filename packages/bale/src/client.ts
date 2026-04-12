import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { request } from 'undici';
import { BaleDeliveryError } from '@pinbale/core';

type InlineKeyboardButton = { text: string; callback_data: string };

type SendMessageParams = {
  chatId: string;
  text: string;
  replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
};

type SendPhotoParams = {
  chatId: string;
  photoUrl: string;
  caption?: string;
};

type SendPhotoFileParams = {
  chatId: string;
  filePath: string;
  caption?: string;
};

type SendVideoParams = {
  chatId: string;
  videoUrl: string;
  caption?: string;
};

type SendVideoFileParams = {
  chatId: string;
  filePath: string;
  caption?: string;
};

export class BaleClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://tapi.bale.ai/bot',
    private readonly timeoutMs = 10000
  ) {}

  private get endpoint() {
    return `${this.baseUrl}${this.token}`;
  }

  async sendMessage(params: SendMessageParams): Promise<void> {
    const t = this.timeoutMs;
    await this.withRetry(async () => {
      const body: Record<string, unknown> = { chat_id: params.chatId, text: params.text };
      if (params.replyMarkup) {
        body.reply_markup = params.replyMarkup;
      }
      const { statusCode } = await request(`${this.endpoint}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        headersTimeout: t,
        bodyTimeout: t,
        signal: AbortSignal.timeout(t + 2000)
      });
      if (statusCode >= 400) throw new BaleDeliveryError(`sendMessage failed with ${statusCode}`);
    });
  }

  async answerCallbackQuery(params: {
    callbackQueryId: string;
    text?: string;
    showAlert?: boolean;
  }): Promise<void> {
    await this.withRetry(async () => {
      const t = this.timeoutMs;
      const { statusCode } = await request(`${this.endpoint}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: params.callbackQueryId,
          text: params.text,
          show_alert: params.showAlert ?? false
        }),
        headersTimeout: t,
        bodyTimeout: t,
        signal: AbortSignal.timeout(t + 2000)
      });
      if (statusCode >= 400) {
        throw new BaleDeliveryError(`answerCallbackQuery failed with ${statusCode}`);
      }
    });
  }

  async sendPhoto(params: SendPhotoParams): Promise<void> {
    const urlFetchTimeout = Math.max(this.timeoutMs, 25_000);
    await this.withRetry(async () => {
      const { statusCode } = await request(`${this.endpoint}/sendPhoto`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: params.chatId,
          photo: params.photoUrl,
          caption: params.caption
        }),
        headersTimeout: urlFetchTimeout,
        bodyTimeout: urlFetchTimeout,
        signal: AbortSignal.timeout(urlFetchTimeout + 5000)
      });
      if (statusCode >= 400) throw new BaleDeliveryError(`sendPhoto failed with ${statusCode}`);
    });
  }

  /** ارسال عکس به‌صورت multipart (مثل API تلگرام/بله). */
  async sendVideo(params: SendVideoParams): Promise<void> {
    const urlFetchTimeout = Math.max(this.timeoutMs, 40_000);
    await this.withRetry(async () => {
      const { statusCode } = await request(`${this.endpoint}/sendVideo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: params.chatId,
          video: params.videoUrl,
          caption: params.caption,
          supports_streaming: true
        }),
        headersTimeout: urlFetchTimeout,
        bodyTimeout: urlFetchTimeout,
        signal: AbortSignal.timeout(urlFetchTimeout + 5000)
      });
      if (statusCode >= 400) throw new BaleDeliveryError(`sendVideo failed with ${statusCode}`);
    });
  }

  async sendVideoFromFile(params: SendVideoFileParams): Promise<void> {
    const uploadTimeout = Math.max(this.timeoutMs, 120_000);
    const filename = basename(params.filePath);

    await this.withRetryUpload(async () => {
      const buf = await readFile(params.filePath);
      const form = new FormData();
      form.append('chat_id', params.chatId);
      form.append('video', new Blob([buf]), filename);
      if (params.caption) form.append('caption', params.caption);

      const { statusCode } = await request(`${this.endpoint}/sendVideo`, {
        method: 'POST',
        body: form,
        headersTimeout: uploadTimeout,
        bodyTimeout: uploadTimeout,
        signal: AbortSignal.timeout(uploadTimeout + 15_000)
      });
      if (statusCode >= 400) {
        throw new BaleDeliveryError(`sendVideoFromFile failed with ${statusCode}`);
      }
    });
  }

  async sendPhotoFromFile(params: SendPhotoFileParams): Promise<void> {
    const uploadTimeout = Math.max(this.timeoutMs, 45_000);
    const filename = basename(params.filePath);

    await this.withRetryUpload(async () => {
      const buf = await readFile(params.filePath);
      const form = new FormData();
      form.append('chat_id', params.chatId);
      form.append('photo', new Blob([buf]), filename);
      if (params.caption) form.append('caption', params.caption);

      const { statusCode } = await request(`${this.endpoint}/sendPhoto`, {
        method: 'POST',
        body: form,
        headersTimeout: uploadTimeout,
        bodyTimeout: uploadTimeout,
        signal: AbortSignal.timeout(uploadTimeout + 15_000)
      });
      if (statusCode >= 400) {
        throw new BaleDeliveryError(`sendPhotoFromFile failed with ${statusCode}`);
      }
    });
  }

  private async withRetry(fn: () => Promise<void>) {
    let attempt = 0;
    const maxAttempt = 3;
    while (attempt < maxAttempt) {
      try {
        await fn();
        return;
      } catch (error) {
        if (!shouldRetryError(error)) throw error;
        attempt += 1;
        if (attempt >= maxAttempt) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }

  /** آپلود multipart کمتر تکرار می‌شود تا حداکثر زمان انتظار انفجار نکند */
  private async withRetryUpload(fn: () => Promise<void>) {
    let attempt = 0;
    const maxAttempt = 2;
    while (attempt < maxAttempt) {
      try {
        await fn();
        return;
      } catch (error) {
        if (!shouldRetryError(error)) throw error;
        attempt += 1;
        if (attempt >= maxAttempt) throw error;
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }
}

function shouldRetryError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const status = extractHttpStatusFromMessage(error.message);
  if (status !== null) {
    if (status === 408 || status === 429) return true;
    if (status >= 500) return true;
    return false;
  }
  return true;
}

function extractHttpStatusFromMessage(message: string): number | null {
  const match = /failed with (\d{3})/.exec(message);
  if (!match) return null;
  const status = Number.parseInt(match[1], 10);
  return Number.isFinite(status) ? status : null;
}
