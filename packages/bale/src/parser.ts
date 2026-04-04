import type { BaleCommand } from './types.js';

function isCommand(cmd: string, text: string): boolean {
  return text === cmd || text.startsWith(`${cmd}@`);
}

export function parseBaleTextCommand(text: string): BaleCommand {
  const trimmed = text.trim();
  if (isCommand('/start', trimmed)) return { type: 'start' };
  if (isCommand('/help', trimmed)) return { type: 'help' };
  if (isCommand('/next', trimmed)) return { type: 'next' };
  if (isCommand('/مواد', trimmed)) return { type: 'materials' };
  if (trimmed.startsWith('/page ')) {
    const page = Number(trimmed.replace('/page', '').trim());
    if (!Number.isNaN(page) && page > 0) {
      return { type: 'page', page };
    }
  }
  return { type: 'search', query: trimmed };
}
