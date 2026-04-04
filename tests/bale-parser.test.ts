import { describe, expect, test } from 'vitest';
import { parseBaleTextCommand } from '@pinbale/bale';

describe('parseBaleTextCommand', () => {
  test('parses /مواد', () => {
    expect(parseBaleTextCommand('/مواد')).toEqual({ type: 'materials' });
    expect(parseBaleTextCommand('  /مواد  ')).toEqual({ type: 'materials' });
  });

  test('parses /مواد with bot suffix', () => {
    expect(parseBaleTextCommand('/مواد@SomeBot')).toEqual({ type: 'materials' });
  });

  test('parses /start with bot suffix', () => {
    expect(parseBaleTextCommand('/start@Bot')).toEqual({ type: 'start' });
  });
});
