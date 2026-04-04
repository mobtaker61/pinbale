import { BaleDeliveryError } from '@pinbale/core';
import { BaleClient } from './client.js';

export class BaleAdapter {
  constructor(private readonly client: BaleClient) {}

  async sendText(chatId: string, text: string) {
    await this.client.sendMessage({ chatId, text });
  }

  async sendPhotoFromFile(chatId: string, filePath: string, caption?: string) {
    await this.client.sendPhotoFromFile({ chatId, filePath, caption });
  }

  async sendResultWithOptionalPhoto(chatId: string, text: string, imageUrl?: string | null) {
    if (!imageUrl) {
      await this.sendText(chatId, text);
      return;
    }
    try {
      await this.client.sendPhoto({ chatId, photoUrl: imageUrl, caption: text });
    } catch (error) {
      if (error instanceof BaleDeliveryError) {
        await this.sendText(chatId, text);
      } else {
        throw error;
      }
    }
  }
}
