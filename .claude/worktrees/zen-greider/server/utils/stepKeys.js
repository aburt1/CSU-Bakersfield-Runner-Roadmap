function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeStepKey(value) {
  const normalized = slugify(value);
  return normalized || null;
}

export function buildStepKeyBase({ stepKey, title, fallback } = {}) {
  return normalizeStepKey(stepKey) || normalizeStepKey(title) || normalizeStepKey(fallback) || 'step';
}

export function createUniqueKey(baseKey, usedKeys) {
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

export async function getUniqueStepKeyForTerm(db, termId, { stepKey, title, fallback, excludeStepId } = {}) {
  const base = buildStepKeyBase({ stepKey, title, fallback });
  const rows = excludeStepId
    ? await db.queryAll('SELECT step_key FROM steps WHERE term_id = $1 AND id != $2 AND step_key IS NOT NULL', [termId, excludeStepId])
    : await db.queryAll('SELECT step_key FROM steps WHERE term_id = $1 AND step_key IS NOT NULL', [termId]);
  const usedKeys = new Set(rows.map((row) => row.step_key).filter(Boolean));
  return createUniqueKey(base, usedKeys);
}

export async function ensureStepKeys(db) {
  const steps = await db.queryAll(`
    SELECT id, title, term_id, step_key
    FROM steps
    ORDER BY COALESCE(term_id, 0), sort_order, id
  `);
  const usedByTerm = new Map();

  for (const step of steps) {
    const termKey = step.term_id ?? 'global';
    const usedKeys = usedByTerm.get(termKey) || new Set();
    const nextKey = createUniqueKey(
      buildStepKeyBase({
        stepKey: step.step_key,
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
