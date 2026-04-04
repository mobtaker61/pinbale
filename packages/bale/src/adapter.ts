import { BaleDeliveryError } from '@pinbale/core';
import { CALLBACK_MATERIALS_AGAIN } from './constants.js';
import { BaleClient } from './client.js';
import { faMessages } from './messages.js';

export class BaleAdapter {
  constructor(private readonly client: BaleClient) {}

  async sendText(chatId: string, text: string) {
    await this.client.sendMessage({ chatId, text });
  }

  async sendTextWithAgainButton(chatId: string, text: string) {
    await this.client.sendMessage({
      chatId,
      text,
      replyMarkup: {
        inline_keyboard: [[{ text: faMessages.againButton, callback_data: CALLBACK_MATERIALS_AGAIN }]]
      }
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    await this.client.answerCallbackQuery({ callbackQueryId, text, showAlert: false });
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
