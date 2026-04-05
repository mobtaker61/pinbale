import { describe, expect, test } from 'vitest';
import {
  InstagramPrivateError,
  InstagramScraperError,
  parseWebProfileResponse
} from '@pinbale/instagram';

describe('parseWebProfileResponse', () => {
  test('maps edges to InstagramPost', () => {
    const json = {
      status: 'ok',
      data: {
        user: {
          is_private: false,
          edge_owner_to_timeline_media: {
            edges: [
              {
                node: {
                  shortcode: 'abc123',
                  display_url: 'https://cdn.example.com/p.jpg',
                  edge_media_to_caption: {
                    edges: [{ node: { text: 'hello' } }]
                  },
                  edge_liked_by: { count: 5 },
                  taken_at_timestamp: 1700000000
                }
              }
            ]
          }
        }
      }
    };
    const posts = parseWebProfileResponse(json, 9);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.id).toBe('abc123');
    expect(posts[0]!.imageUrl).toContain('cdn.example.com');
    expect(posts[0]!.caption).toBe('hello');
    expect(posts[0]!.likes).toBe(5);
  });

  test('private account throws', () => {
    expect(() =>
      parseWebProfileResponse(
        {
          status: 'ok',
          data: { user: { is_private: true, edge_owner_to_timeline_media: { edges: [] } } }
        },
        9
      )
    ).toThrow(InstagramPrivateError);
  });

  test('status fail throws', () => {
    expect(() =>
      parseWebProfileResponse({ status: 'fail', message: 'Something wrong' }, 9)
    ).toThrow(InstagramScraperError);
  });
});
