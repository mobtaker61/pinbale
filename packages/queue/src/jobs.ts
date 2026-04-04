export type SearchJobPayload = {
  userId: string;
  chatId: string;
  query: string;
  page: number;
  requestId: string;
};

export type MaterialsJobPayload = {
  userId: string;
  chatId: string;
  requestId: string;
};

export type ScreenshotArchivePayload = {
  path: string;
  provider: string;
  reason: string;
  createdAt: string;
};

export type ProviderWarmupPayload = {
  provider: string;
};

export type ProviderHealthPayload = {
  provider: string;
};
