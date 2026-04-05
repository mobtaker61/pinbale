import { describe, expect, test } from 'vitest';
import { InstagramScraperError, normalizeHttpProxyUrl } from '@pinbale/instagram';

describe('normalizeHttpProxyUrl', () => {
  test('adds http when scheme missing', () => {
    expect(normalizeHttpProxyUrl('127.0.0.1:8888')).toBe('http://127.0.0.1:8888/');
  });

  test('accepts full http URL', () => {
    expect(normalizeHttpProxyUrl('http://u:p@proxy.example.com:3128')).toContain('proxy.example.com');
  });

  test('rejects socks scheme', () => {
    expect(() => normalizeHttpProxyUrl('socks5://127.0.0.1:1080')).toThrow(InstagramScraperError);
  });
});
