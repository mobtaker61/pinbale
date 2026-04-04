export const faMessages = {
  searching: 'در حال جستجو...',
  start: 'سلام! عبارت موردنظر را بفرستید تا نتایج پینترست را پیدا کنم.',
  helpLines: [
    'راهنمای ربات جستجوی پینترست:',
    '- متن عادی: جستجو',
    '- /next : صفحه بعد',
    '- /page N : رفتن به صفحه خاص',
    '- /مواد : ارسال تصادفی چند تصویر از آرشیو محلی',
    '- /help : نمایش راهنما'
  ],
  providerFailure: 'فعلاً دسترسی به منبع جستجو دچار مشکل شده. چند دقیقه دیگر دوباره تلاش کنید.',
  rateLimited: 'تعداد درخواست‌ها زیاد است. لطفاً کمی بعد دوباره تلاش کنید.',
  invalidInput: 'متن ورودی معتبر نیست. لطفاً یک عبارت کوتاه و مناسب ارسال کنید.',
  notAllowlisted: 'این ربات در حال حاضر برای شما فعال نیست.',
  noTitle: 'بدون عنوان',
  resultHeader: (query: string) => `نتایج برای: ${query}`,
  pageLabel: (page: number) => `صفحه ${page}`,
  degradedWarning: 'هشدار: نتایج با محدودیت منبع ارائه شده است.',
  pinterestLinkLabel: 'لینک پینترست',
  sourceLinkLabel: 'لینک منبع',
  pageReady: (count: number) => `${count} نتیجه در این صفحه آماده شد.`,
  nextHint: 'برای دیدن نتایج بعدی /next را بزنید.',
  noResults: (query: string) => `برای "${query}" نتیجه‌ای پیدا نشد.`,
  webhookUnauthorized: 'دسترسی وبهوک غیرمجاز است.',
  internalUnauthorized: 'دسترسی غیرمجاز است.',
  materialsQueued: 'درخواست شما ثبت شد؛ تصاویر به‌زودی ارسال می‌شوند.',
  noLocalImages:
    'تصویری در پوشهٔ محلی برای ارسال نیست. لطفاً در پوشهٔ images (ریشهٔ پروژه) فایل بگذارید.',
  materialsSendFailed: 'ارسال بخشی از تصاویر ناموفق بود. دوباره تلاش کنید.'
} as const;
