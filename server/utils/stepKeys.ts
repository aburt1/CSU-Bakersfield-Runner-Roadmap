import type { Db } from '../types/db.js';

function slugify(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeStepKey(value: string): string | null {
  const normalized = slugify(value);
  return normalized || null;
}

export function buildStepKeyBase({ stepKey, title, fallback }: { stepKey?: string; title?: string; fallback?: string } = {}): string {
  return normalizeStepKey(stepKey ?? '') || normalizeStepKey(title ?? '') || normalizeStepKey(fallback ?? '') || 'step';
}

export function createUniqueKey(baseKey: string, usedKeys: Set<string>): string {
  const base = normalizeStepKey(baseKey) || 'step';
  let candidate = base;
  let suffix = 2;

  while (usedKeys.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedKeys.add(candidate);
  return candidate;
}

export async function getUniqueStepKeyForTerm(
  db: Db,
  termId: number,
  { stepKey, title, fallback, excludeStepId }: { stepKey?: string; title?: string; fallback?: string; excludeStepId?: number } = {}
): Promise<string> {
  const base = buildStepKeyBase({ stepKey, title, fallback });
  const rows = excludeStepId
    ? await db.queryAll<{ step_key: string }>('SELECT step_key FROM steps WHERE term_id = $1 AND id != $2 AND step_key IS NOT NULL', [termId, excludeStepId])
    : await db.queryAll<{ step_key: string }>('SELECT step_key FROM steps WHERE term_id = $1 AND step_key IS NOT NULL', [termId]);
  const usedKeys = new Set(rows.map((row) => row.step_key).filter(Boolean));
  return createUniqueKey(base, usedKeys);
}

export async function ensureStepKeys(db: Db): Promise<void> {
  const steps = await db.queryAll<{ id: number; title: string; term_id: number | null; step_key: string | null }>(
    `SELECT id, title, term_id, step_key
    FROM steps
    ORDER BY COALESCE(term_id, 0), sort_order, id`
  );
  const usedByTerm = new Map<string | number, Set<string>>();

  for (const step of steps) {
    const termKey = step.term_id ?? 'global';
    const usedKeys = usedByTerm.get(termKey) || new Set<string>();
    const nextKey = createUniqueKey(
      buildStepKeyBase({
        stepKey: step.step_key ?? undefined,
        title: step.title,
        fallback: `step-${step.id}`,
      }),
      usedKeys
    );

    usedByTerm.set(termKey, usedKeys);

    if (step.step_key !== nextKey) {
      await db.execute('UPDATE steps SET step_key = $1 WHERE id = $2', [nextKey, step.id]);
    }
  }
}
