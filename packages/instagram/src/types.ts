import type { MessengerPlatform } from '@pinbale/core';

export type InstagramPost = {
  id: string;
  caption: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  likes: number;
  timestamp: number;
};

/** بارِ صفٔ BullMQ (هم‌نام با queue payload). */
export type InstagramJobPayload = {
  userId: string;
  chatId: string;
  requestId: string;
  instagramUsername: string;
  platform?: MessengerPlatform;
};
