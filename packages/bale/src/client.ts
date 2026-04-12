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
    await this.withRetry(async () => {
      const body: Record<string, unknown> = { chat_id: params.chatId, text: params.text };
      if (params.replyMarkup) {
        body.reply_markup = params.replyMarkup;
      }
      const { statusCode } = await request(`${this.endpoint}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        headersTimeout: this.timeoutMs,
        bodyTimeout: this.timeoutMs
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
      const { statusCode } = await request(`${this.endpoint}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: params.callbackQueryId,
          text: params.text,
          show_alert: params.showAlert ?? false
        }),
        headersTimeout: this.timeoutMs,
        bodyTimeout: this.timeoutMs
      });
      if (statusCode >= 400) {
        throw new BaleDeliveryError(`answerCallbackQuery failed with ${statusCode}`);
      }
    });
  }

  async sendPhoto(params: SendPhotoParams): Promise<void> {
    const urlFetchTimeout = Math.max(this.timeoutMs, 90_000);
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
        bodyTimeout: urlFetchTimeout
      });
      if (statusCode >= 400) throw new BaleDeliveryError(`sendPhoto failed with ${statusCode}`);
    });
  }

  /** ارسال عکس به‌صورت multipart (مثل API تلگرام/بله). */
  async sendVideo(params: SendVideoParams): Promise<void> {
    const urlFetchTimeout = Math.max(this.timeoutMs, 120_000);
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
        bodyTimeout: urlFetchTimeout
      });
      if (statusCode >= 400) throw new BaleDeliveryError(`sendVideo failed with ${statusCode}`);
    });
  }

  async sendVideoFromFile(params: SendVideoFileParams): Promise<void> {
    const buf = await readFile(params.filePath);
    const filename = basename(params.filePath);
    const form = new FormData();
    form.append('chat_id', params.chatId);
    form.append('video', new Blob([buf]), filename);
    if (params.caption) form.append('caption', params.caption);

    const uploadTimeout = Math.max(this.timeoutMs, 120_000);

    await this.withRetry(async () => {
      const { statusCode } = await request(`${this.endpoint}/sendVideo`, {
        method: 'POST',
        body: form,
        headersTimeout: uploadTimeout,
        bodyTimeout: uploadTimeout
      });
      if (statusCode >= 400) {
        throw new BaleDeliveryError(`sendVideoFromFile failed with ${statusCode}`);
      }
    });
  }

  async sendPhotoFromFile(params: SendPhotoFileParams): Promise<void> {
    const buf = await readFile(params.filePath);
    const filename = basename(params.filePath);
    const form = new FormData();
    form.append('chat_id', params.chatId);
    form.append('photo', new Blob([buf]), filename);
    if (params.caption) form.append('caption', params.caption);

    const uploadTimeout = Math.max(this.timeoutMs, 90_000);

    await this.withRetry(async () => {
      const { statusCode } = await request(`${this.endpoint}/sendPhoto`, {
        method: 'POST',
        body: form,
        headersTimeout: uploadTimeout,
        bodyTimeout: uploadTimeout
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
        attempt += 1;
        if (attempt >= maxAttempt) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }
}
