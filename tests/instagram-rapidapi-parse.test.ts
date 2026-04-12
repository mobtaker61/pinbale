import { describe, expect, test } from 'vitest';
import { parseRapidApiPostsPayload } from '@pinbale/instagram';

describe('parseRapidApiPostsPayload', () => {
  test('flat array with image_url', () => {
    const posts = parseRapidApiPostsPayload(
      {
        data: [
          {
            id: '1',
            caption: 'hi',
            image_url: 'https://cdn.example.com/a.jpg',
            like_count: 3,
            timestamp: 1700000000
          }
        ]
      },
      9
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]!.items[0]!.url).toContain('cdn.example.com');
    expect(posts[0]!.caption).toBe('hi');
  });

  test('edges with node', () => {
    const posts = parseRapidApiPostsPayload(
      {
        edges: [
          {
            node: {
              shortcode: 'x',
              display_url: 'https://cdn.example.com/n.jpg',
              edge_media_to_caption: { edges: [{ node: { text: 'cap' } }] },
              edge_liked_by: { count: 2 },
              taken_at_timestamp: 1700000001
            }
          }
        ]
      },
      9
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]!.id).toBe('x');
    expect(posts[0]!.items[0]!.kind).toBe('image');
  });

  test('respects maxPosts', () => {
    const arr = Array.from({ length: 20 }, (_, i) => ({
      image_url: `https://x.com/${i}.jpg`,
      id: String(i)
    }));
    const posts = parseRapidApiPostsPayload({ posts: arr }, 5);
    expect(posts.length).toBeLessThanOrEqual(5);
  });

  test('nested response.result.items and image_versions2', () => {
    const posts = parseRapidApiPostsPayload(
      {
        result: {
          items: [
            {
              id: 'a',
              image_versions2: {
                candidates: [{ url: 'https://cdn.example.com/iv2.jpg', width: 1080 }]
              }
            }
          ]
        }
      },
      9
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]!.items[0]!.url).toContain('iv2.jpg');
  });
});
