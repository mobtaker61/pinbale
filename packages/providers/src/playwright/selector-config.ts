export const SELECTORS = {
  resultCard: '[data-test-id="pin"], [data-grid-item], a[href*="/pin/"]',
  resultTitle: '[data-test-id="pinTitle"], [title]',
  resultImage: 'img',
  resultLink: 'a[href*="/pin/"]',
  outboundLink: 'a[href^="http"]:not([href*="pinterest."])',
  loginWall: '[data-test-id="signup"], form[action*="login"], [data-test-id="simple-signup"]',
  captcha: 'iframe[src*="captcha"], [id*="captcha"], [class*="captcha"]',
  antiBotText: 'body'
} as const;
