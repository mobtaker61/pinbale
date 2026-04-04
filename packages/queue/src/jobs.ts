export type MaterialsJobPayload = {
  userId: string;
  chatId: string;
  requestId: string;
  /** نام پوشهٔ مستقیم زیر images؛ اگر نباشد فقط فایل‌های ریشهٔ images */
  sourceSubfolder?: string;
};
