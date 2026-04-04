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

  test('parses /pin like /مواد', () => {
    expect(parseBaleTextCommand('/pin')).toEqual({ type: 'materials' });
    expect(parseBaleTextCommand('/pin@Bot')).toEqual({ type: 'materials' });
  });

  test('plain text is unknown', () => {
    expect(parseBaleTextCommand('گربه')).toEqual({ type: 'unknown', text: 'گربه' });
  });

  test('old search commands are legacy', () => {
    expect(parseBaleTextCommand('/next')).toEqual({ type: 'legacySearchCommand' });
    expect(parseBaleTextCommand('/page 2')).toEqual({ type: 'legacySearchCommand' });
  });
});
