import type { MessengerPlatform } from '@pinbale/core';

export type { InstagramJobPayload } from '@pinbale/instagram';

export type MaterialsJobPayload = {
  userId: string;
  chatId: string;
  requestId: string;
  /** نام پوشهٔ مستقیم زیر images؛ اگر نباشد فقط فایل‌های ریشهٔ images */
  sourceSubfolder?: string;
  /** پیش‌فرض bale برای jobهای قدیمی در صف */
  platform?: MessengerPlatform;
};
