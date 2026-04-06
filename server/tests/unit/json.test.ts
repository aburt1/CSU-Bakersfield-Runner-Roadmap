import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../../utils/json.js';

describe('safeJsonParse', () => {
  it('parses valid JSON string', () => {
    expect(safeJsonParse('["a","b"]', [])).toEqual(['a', 'b']);
  });
  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not-json', [])).toEqual([]);
  });
  it('returns fallback for null', () => {
    expect(safeJsonParse(null, 'default')).toBe('default');
  });
  it('returns fallback for undefined', () => {
    expect(safeJsonParse(undefined, 42)).toBe(42);
  });
  it('returns non-string values directly', () => {
    const obj = { a: 1 };
    expect(safeJsonParse(obj, {})).toBe(obj);
  });
});
