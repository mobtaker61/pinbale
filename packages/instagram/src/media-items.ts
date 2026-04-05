import type { InstagramMediaItem, InstagramPost } from './types.js';

/** رسانه‌های قابل دانلود برای یک پست (items پر شده یا فیلدهای قدیمی). */
export function getMediaItemsForPost(post: InstagramPost): InstagramMediaItem[] {
  if (post.items.length > 0) return post.items;
  if (post.videoUrl) return [{ kind: 'video', url: post.videoUrl }];
  if (post.imageUrl) return [{ kind: 'image', url: post.imageUrl }];
  return [];
}
