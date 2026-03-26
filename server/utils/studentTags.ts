import { safeJsonParse } from './json.js';

interface StudentLike {
  tags?: string | null;
  applicant_type?: string | null;
  residency?: string | null;
  major?: string | null;
}

function slugify(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getManualTags(student: StudentLike | null | undefined): string[] {
  return safeJsonParse<string[]>(student?.tags, []);
}

export function getDerivedTags(student: StudentLike | null | undefined): string[] {
  const tags: string[] = [];
  const applicantType = String(student?.applicant_type || '').toLowerCase();
  const residency = String(student?.residency || '').toLowerCase();
  const major = student?.major ? slugify(student.major) : '';

  if (applicantType.includes('transfer')) tags.push('transfer');
  if (applicantType.includes('freshman')) tags.push('freshman');
  if (applicantType.includes('readmit')) tags.push('readmit');
  if (residency.includes('out-of-state')) tags.push('out-of-state');
  if (residency.includes('in-state')) tags.push('in-state');
  if (major) tags.push(`major:${major}`);

  return [...new Set(tags)];
}

export function getMergedTags(student: StudentLike | null | undefined): string[] {
  return [...new Set([...getManualTags(student), ...getDerivedTags(student)])];
}
