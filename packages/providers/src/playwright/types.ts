export type BrowserProviderConfig = {
  headless: boolean;
  navTimeoutMs: number;
  actionTimeoutMs: number;
  maxContexts: number;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  userAgent?: string;
  artifactsDir: string;
};

export type RawCard = {
  pinterestUrl: string;
  title: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
};
