/** کاربر اینستاگرام وجود ندارد یا حذف شده */
export class InstagramNotFoundError extends Error {
  readonly code = 'INSTAGRAM_NOT_FOUND' as const;
  constructor(message = 'Profile not found') {
    super(message);
    this.name = 'InstagramNotFoundError';
  }
}

/** پروفایل خصوصی و بدون دسترسي مهمان */
export class InstagramPrivateError extends Error {
  readonly code = 'INSTAGRAM_PRIVATE' as const;
  constructor(message = 'Private profile') {
    super(message);
    this.name = 'InstagramPrivateError';
  }
}

/** مسدود / چالش اینستاگرام (مثلاً 409) */
export class InstagramBlockedError extends Error {
  readonly code = 'INSTAGRAM_BLOCKED' as const;
  constructor(message = 'Account blocked or restricted') {
    super(message);
    this.name = 'InstagramBlockedError';
  }
}

/** خطای عمومی اسکرپ یا شبکه */
export class InstagramScraperError extends Error {
  readonly code = 'INSTAGRAM_SCRAPER' as const;
  constructor(
    message: string,
    readonly statusHint?: number
  ) {
    super(message);
    this.name = 'InstagramScraperError';
  }
}
