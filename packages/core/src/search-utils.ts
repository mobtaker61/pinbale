import { ValidationError } from './errors.js';

const whitespaceRegex = /\s+/g;

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(whitespaceRegex, ' ');
}

export function validateQuery(query: string, maxLength: number, bannedWords: string[]): string {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    throw new ValidationError('Query is empty');
  }
  if (normalized.length > maxLength) {
    throw new ValidationError('Query is too long', { maxLength });
  }
  const containsBanned = bannedWords.some((word) => normalized.includes(word.toLowerCase()));
  if (containsBanned) {
    throw new ValidationError('Query contains banned keyword');
  }
  return normalized;
}

export function paginate(total: number, page: number, perPage: number) {
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);
  return { start, end, hasNextPage: end < total };
}

export function createStableResultId(query: string, pinterestUrl: string, rank: number): string {
  return `${query}:${pinterestUrl}:${rank}`;
}
