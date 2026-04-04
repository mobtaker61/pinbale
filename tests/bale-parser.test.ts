import { describe, expect, test } from 'vitest';
import { parseBaleTextCommand } from '@pinbale/bale';

describe('parseBaleTextCommand', () => {
  test('parses /list', () => {
    expect(parseBaleTextCommand('/list')).toEqual({ type: 'listFolders' });
    expect(parseBaleTextCommand('/list@Bot')).toEqual({ type: 'listFolders' });
  });

  test('/pin and /مواد are not commands (unknown)', () => {
    expect(parseBaleTextCommand('/pin')).toEqual({ type: 'unknown', text: '/pin' });
    expect(parseBaleTextCommand('/مواد')).toEqual({ type: 'unknown', text: '/مواد' });
  });

  test('parses /start with bot suffix', () => {
    expect(parseBaleTextCommand('/start@Bot')).toEqual({ type: 'start' });
  });

  test('plain text is unknown', () => {
    expect(parseBaleTextCommand('گربه')).toEqual({ type: 'unknown', text: 'گربه' });
  });

  test('old search commands are legacy', () => {
    expect(parseBaleTextCommand('/next')).toEqual({ type: 'legacySearchCommand' });
    expect(parseBaleTextCommand('/page 2')).toEqual({ type: 'legacySearchCommand' });
  });
});
