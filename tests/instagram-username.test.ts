import { describe, expect, test } from 'vitest';
import { extractInstagramUsername, InstagramUsernameSchema } from '@pinbale/instagram';

describe('instagram username', () => {
  test('extractInstagramUsername from commands', () => {
    expect(extractInstagramUsername('/instagram natgeo')).toBe('natgeo');
    expect(extractInstagramUsername('/ig test_user')).toBe('test_user');
    expect(extractInstagramUsername('/instagram@SomeBot natgeo')).toBe('natgeo');
    expect(extractInstagramUsername('/instagram')).toBe('');
    expect(extractInstagramUsername('/list')).toBe(null);
  });

  test('extractInstagramUsername from URL and @', () => {
    expect(extractInstagramUsername('/instagram https://instagram.com/NatGeo/')).toBe('natgeo');
    expect(extractInstagramUsername('/ig @My.User_Name')).toBe('my.user_name');
  });

  test('InstagramUsernameSchema', () => {
    expect(InstagramUsernameSchema.safeParse('valid_user.1').success).toBe(true);
    expect(InstagramUsernameSchema.safeParse('bad!').success).toBe(false);
    expect(InstagramUsernameSchema.safeParse('a'.repeat(31)).success).toBe(false);
  });
});
