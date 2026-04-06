import { describe, it, expect } from 'vitest';
import { parseTermId, parsePagination } from '../../utils/queryHelpers.js';

function fakeReq(query: Record<string, string> = {}): any {
  return { query };
}

describe('parseTermId', () => {
  it('returns number for valid term_id', () => {
    expect(parseTermId(fakeReq({ term_id: '5' }))).toBe(5);
  });
  it('returns null when term_id is missing', () => {
    expect(parseTermId(fakeReq())).toBeNull();
  });
  it('returns NaN for non-numeric', () => {
    const result = parseTermId(fakeReq({ term_id: 'abc' }));
    expect(Number.isNaN(result)).toBe(true);
  });
});

describe('parsePagination', () => {
  it('returns defaults when no query params', () => {
    const { page, perPage, offset } = parsePagination(fakeReq());
    expect(page).toBe(1);
    expect(perPage).toBe(25);
    expect(offset).toBe(0);
  });
  it('respects custom defaults', () => {
    const { perPage } = parsePagination(fakeReq(), { perPage: 50 });
    expect(perPage).toBe(50);
  });
  it('calculates offset correctly', () => {
    const { page, perPage, offset } = parsePagination(fakeReq({ page: '3', per_page: '10' }));
    expect(page).toBe(3);
    expect(perPage).toBe(10);
    expect(offset).toBe(20);
  });
  it('caps perPage at 100', () => {
    const { perPage } = parsePagination(fakeReq({ per_page: '999' }));
    expect(perPage).toBe(100);
  });
  it('floors page at 1', () => {
    const { page } = parsePagination(fakeReq({ page: '-5' }));
    expect(page).toBe(1);
  });
  it('falls back to default for per_page=0 (falsy)', () => {
    const { perPage } = parsePagination(fakeReq({ per_page: '0' }));
    expect(perPage).toBe(25);
  });
});
