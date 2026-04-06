import { describe, it, expect } from 'vitest';
import { paramBuilder } from '../../db/pool.js';

describe('paramBuilder', () => {
  it('generates sequential $1, $2, $3 placeholders', () => {
    const p = paramBuilder();
    expect(p.next()).toBe('$1');
    expect(p.next()).toBe('$2');
    expect(p.next()).toBe('$3');
  });
  it('starts from custom offset', () => {
    const p = paramBuilder(5);
    expect(p.next()).toBe('$6');
    expect(p.next()).toBe('$7');
  });
  it('tracks count correctly', () => {
    const p = paramBuilder();
    expect(p.count).toBe(0);
    p.next();
    expect(p.count).toBe(1);
    p.next();
    expect(p.count).toBe(2);
  });
  it('independent builders do not interfere', () => {
    const a = paramBuilder();
    const b = paramBuilder();
    a.next(); a.next();
    expect(b.next()).toBe('$1');
    expect(a.next()).toBe('$3');
  });
});
