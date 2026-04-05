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
    expect(posts[0]!.items).toHaveLength(1);
    expect(posts[0]!.items[0]!.kind).toBe('image');
    expect(posts[0]!.imageUrl).toContain('cdn.example.com');
    expect(posts[0]!.caption).toBe('hello');
    expect(posts[0]!.likes).toBe(5);
  });

  test('sidecar maps multiple images', () => {
    const json = {
      status: 'ok',
      data: {
        user: {
          is_private: false,
          edge_owner_to_timeline_media: {
            edges: [
              {
                node: {
                  shortcode: 'side1',
                  __typename: 'GraphSidecar',
                  display_url: 'https://cdn.example.com/cover.jpg',
                  edge_sidecar_to_children: {
                    edges: [
                      {
                        node: {
                          __typename: 'GraphImage',
                          display_url: 'https://cdn.example.com/a.jpg',
                          is_video: false
                        }
                      },
                      {
                        node: {
                          __typename: 'GraphImage',
                          display_url: 'https://cdn.example.com/b.jpg',
                          is_video: false
                        }
                      }
                    ]
                  },
                  edge_media_to_caption: { edges: [] },
                  edge_liked_by: { count: 1 },
                  taken_at_timestamp: 1700000001
                }
              }
            ]
          }
        }
      }
    };
    const posts = parseWebProfileResponse(json, 9);
    expect(posts[0]!.items).toHaveLength(2);
    expect(posts[0]!.items.map((i) => i.url)).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg'
    ]);
  });

  test('GraphVideo maps video url', () => {
    const json = {
      status: 'ok',
      data: {
        user: {
          is_private: false,
          edge_owner_to_timeline_media: {
            edges: [
              {
                node: {
                  shortcode: 'vid1',
                  __typename: 'GraphVideo',
                  is_video: true,
                  display_url: 'https://cdn.example.com/thumb.jpg',
                  video_url: 'https://cdn.example.com/v.mp4',
                  edge_media_to_caption: { edges: [] },
                  edge_liked_by: { count: 3 },
                  taken_at_timestamp: 1700000002
                }
              }
            ]
          }
        }
      }
    };
    const posts = parseWebProfileResponse(json, 9);
    expect(posts[0]!.items).toEqual([{ kind: 'video', url: 'https://cdn.example.com/v.mp4' }]);
    expect(posts[0]!.videoUrl).toBe('https://cdn.example.com/v.mp4');
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

  test('status fail rate limit message uses 429', () => {
    try {
      parseWebProfileResponse(
        { status: 'fail', message: 'Please wait a few minutes before you try again.' },
        9
      );
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InstagramScraperError);
      expect((e as InstagramScraperError).statusHint).toBe(429);
      expect((e as InstagramScraperError).message).toContain('[JSON]');
    }
  });
});
