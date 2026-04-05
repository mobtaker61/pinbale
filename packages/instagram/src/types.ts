import type { MessengerPlatform } from '@pinbale/core';

export type InstagramMediaKind = 'image' | 'video';

/** یک اسلاید یا یک ویدیوی تکی در تایم‌لاین */
export type InstagramMediaItem = {
  kind: InstagramMediaKind;
  url: string;
};

export type InstagramPost = {
  id: string;
  caption: string | null;
  /** سازگاری عقب: اولین تصویر یا کاور */
  imageUrl: string | null;
  /** سازگاری عقب: اولین ویدیو */
  videoUrl: string | null;
  /** کاروسل، ویدیو، ریلز — ترتیب همان نمایش در اینستاگرام */
  items: InstagramMediaItem[];
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
