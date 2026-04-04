import type { BaleCommand } from './types.js';

function isCommand(cmd: string, text: string): boolean {
  return text === cmd || text.startsWith(`${cmd}@`);
}

export function parseBaleTextCommand(text: string): BaleCommand {
  const trimmed = text.trim();
  if (isCommand('/start', trimmed)) return { type: 'start' };
  if (isCommand('/help', trimmed)) return { type: 'help' };
  if (isCommand('/list', trimmed)) return { type: 'listFolders' };
  if (isCommand('/next', trimmed) || trimmed.startsWith('/page')) {
    return { type: 'legacySearchCommand' };
  }
  return { type: 'unknown', text: trimmed };
}
