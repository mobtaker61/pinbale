import type { BaleCommand } from './types.js';

export function parseBaleTextCommand(text: string): BaleCommand {
  const trimmed = text.trim();
  if (trimmed === '/start') return { type: 'start' };
  if (trimmed === '/help') return { type: 'help' };
  if (trimmed === '/next') return { type: 'next' };
  if (trimmed.startsWith('/page ')) {
    const page = Number(trimmed.replace('/page', '').trim());
    if (!Number.isNaN(page) && page > 0) {
      return { type: 'page', page };
    }
  }
  return { type: 'search', query: trimmed };
}
