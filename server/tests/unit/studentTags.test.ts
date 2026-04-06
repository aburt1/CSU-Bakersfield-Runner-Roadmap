import { describe, it, expect } from 'vitest';
import { getManualTags, getDerivedTags, getMergedTags } from '../../utils/studentTags.js';

describe('getManualTags', () => {
  it('parses JSON tags string', () => {
    expect(getManualTags({ tags: '["honors","eop"]' })).toEqual(['honors', 'eop']);
  });
  it('returns empty array for null tags', () => {
    expect(getManualTags({ tags: null })).toEqual([]);
  });
  it('returns empty array for null student', () => {
    expect(getManualTags(null)).toEqual([]);
  });
});

describe('getDerivedTags', () => {
  it('derives transfer from applicant_type', () => {
    expect(getDerivedTags({ applicant_type: 'Transfer Student' })).toContain('transfer');
  });
  it('derives freshman from applicant_type', () => {
    expect(getDerivedTags({ applicant_type: 'Freshman' })).toContain('freshman');
  });
  it('derives out-of-state from residency', () => {
    expect(getDerivedTags({ residency: 'Out-of-State' })).toContain('out-of-state');
  });
  it('derives major tag with slugified value', () => {
    const tags = getDerivedTags({ major: 'Computer Science' });
    expect(tags).toContain('major:computer-science');
  });
  it('returns empty array for null student', () => {
    expect(getDerivedTags(null)).toEqual([]);
  });
  it('returns empty array for empty fields', () => {
    expect(getDerivedTags({ applicant_type: '', residency: '', major: '' })).toEqual([]);
  });
});

describe('getMergedTags', () => {
  it('merges manual and derived tags without duplicates', () => {
    const tags = getMergedTags({
      tags: '["transfer","honors"]',
      applicant_type: 'Transfer Student',
    });
    expect(tags).toContain('transfer');
    expect(tags).toContain('honors');
    expect(tags.filter(t => t === 'transfer')).toHaveLength(1);
  });
});
