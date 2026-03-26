import type { SearchResultPage } from '@pinbale/core';
import { faMessages } from './messages.js';

export function formatSearchingMessage(): string {
  return faMessages.searching;
}

export function formatHelpMessage(): string {
  return faMessages.helpLines.join('\n');
}

export function formatStartMessage(): string {
  return faMessages.start;
}

export function formatNoResults(query: string): string {
  return faMessages.noResults(query);
}

export function formatProviderFailure(): string {
  return faMessages.providerFailure;
}

export function formatRateLimited(): string {
  return faMessages.rateLimited;
}

export function formatInvalidInput(): string {
  return faMessages.invalidInput;
}

export function formatResultPage(page: SearchResultPage): string {
  const lines = [faMessages.resultHeader(page.query), faMessages.pageLabel(page.page)];
  if (page.degraded) lines.push(faMessages.degradedWarning);
  lines.push('');
  for (const item of page.results) {
    lines.push(`${item.rank}) ${item.title ?? faMessages.noTitle}`);
    lines.push(`${faMessages.pinterestLinkLabel}: ${item.pinterestUrl}`);
    if (item.externalUrl) lines.push(`${faMessages.sourceLinkLabel}: ${item.externalUrl}`);
    lines.push('');
  }
  lines.push(faMessages.pageReady(page.results.length));
  if (page.hasNextPage) lines.push(faMessages.nextHint);
  return lines.join('\n');
}
