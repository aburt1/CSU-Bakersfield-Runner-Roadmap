import { describe, it, expect } from 'vitest';
import { normalizeStudentIdNumber, normalizeCompletedAt } from '../../utils/progress.js';

describe('normalizeStudentIdNumber', () => {
  it('trims whitespace', () => {
    expect(normalizeStudentIdNumber('  12345  ')).toBe('12345');
  });
  it('converts numbers to string', () => {
    expect(normalizeStudentIdNumber(12345)).toBe('12345');
  });
  it('returns empty string for null', () => {
    expect(normalizeStudentIdNumber(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(normalizeStudentIdNumber(undefined)).toBe('');
  });
});

describe('normalizeCompletedAt', () => {
  it('returns ISO string for valid date string', () => {
    const result = normalizeCompletedAt('2026-01-15T10:30:00Z');
    expect(result).toBe('2026-01-15T10:30:00.000Z');
  });
  it('returns null for null input', () => {
    expect(normalizeCompletedAt(null)).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(normalizeCompletedAt('')).toBeNull();
  });
  it('returns null for invalid date string', () => {
    expect(normalizeCompletedAt('not-a-date')).toBeNull();
  });
  it('handles numeric timestamps', () => {
    const ts = Date.now();
    const result = normalizeCompletedAt(ts);
    expect(result).toBe(new Date(ts).toISOString());
  });
});
