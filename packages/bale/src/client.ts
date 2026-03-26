import { request } from 'undici';
import { BaleDeliveryError } from '@pinbale/core';

type SendMessageParams = {
  chatId: string;
  text: string;
};

type SendPhotoParams = {
  chatId: string;
  photoUrl: string;
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
      const { statusCode } = await request(`${this.endpoint}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: params.chatId, text: params.text }),
        headersTimeout: this.timeoutMs,
        bodyTimeout: this.timeoutMs
      });
      if (statusCode >= 400) throw new BaleDeliveryError(`sendMessage failed with ${statusCode}`);
    });
  }

  async sendPhoto(params: SendPhotoParams): Promise<void> {
    await this.withRetry(async () => {
      const { statusCode } = await request(`${this.endpoint}/sendPhoto`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: params.chatId,
          photo: params.photoUrl,
          caption: params.caption
        }),
        headersTimeout: this.timeoutMs,
        bodyTimeout: this.timeoutMs
      });
      if (statusCode >= 400) throw new BaleDeliveryError(`sendPhoto failed with ${statusCode}`);
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
