import { readFileSync } from 'fs';

const FALL_2026_CHECKLIST_PATH = new URL('../manifests/fall2026-onboarding-checklist.json', import.meta.url);

function readChecklistManifest() {
  return JSON.parse(readFileSync(FALL_2026_CHECKLIST_PATH, 'utf8'));
}

function normalizeTitle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildRequiredTags(requiredTags) {
  return Array.isArray(requiredTags) && requiredTags.length > 0
    ? JSON.stringify(requiredTags)
    : null;
}

export function getFall2026ChecklistManifest() {
  return readChecklistManifest();
}

export function importFall2026Checklist(db, termId, { deactivateUnmatched = true } = {}) {
  const manifest = readChecklistManifest();
  const existingSteps = db.prepare('SELECT * FROM steps WHERE term_id = ? ORDER BY sort_order, id').all(termId);
  const updatedIds = new Set();
  const report = {
    inserted: [],
    updated: [],
    deactivated: [],
    steps: [],
  };

  const selectById = db.prepare('SELECT * FROM steps WHERE id = ?');
  const insertStep = db.prepare(`
    INSERT INTO steps (
      title, description, icon, sort_order, deadline, deadline_date, guide_content,
      required_tags, required_tag_mode, excluded_tags, contact_info, links,
      term_id, step_key, is_active, is_public, is_optional
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const updateStep = db.prepare(`
    UPDATE steps
    SET
      title = ?,
      description = ?,
      icon = ?,
      sort_order = ?,
      deadline = ?,
      deadline_date = ?,
      guide_content = ?,
      required_tags = ?,
      required_tag_mode = ?,
      excluded_tags = ?,
      contact_info = ?,
      links = ?,
      step_key = ?,
      is_public = ?,
      is_optional = ?,
      is_active = 1
    WHERE id = ?
  `);

  const importTxn = db.transaction(() => {
    for (const item of manifest) {
      const existing = existingSteps.find((step) => {
        if (step.step_key && step.step_key === item.step_key) return true;
        const itemTitles = [item.title, ...(item.match_titles || [])].map(normalizeTitle);
        return itemTitles.includes(normalizeTitle(step.title));
      });

      const updateValues = [
        item.title,
        item.description || null,
        item.icon || null,
        item.sort_order,
        item.deadline || null,
        item.deadline_date || null,
        item.guide_content || null,
        buildRequiredTags(item.required_tags),
        item.required_tag_mode === 'all' ? 'all' : 'any',
        null,
        existing?.contact_info ?? null,
        existing?.links ?? null,
        item.step_key,
        item.is_public ? 1 : 0,
        item.is_optional ? 1 : 0,
      ];

      const insertValues = [
        ...updateValues.slice(0, 12),
        termId,
        ...updateValues.slice(12),
      ];

      if (existing) {
        updateStep.run(...updateValues, existing.id);
        updatedIds.add(existing.id);
        report.updated.push(item.step_key);
        report.steps.push(selectById.get(existing.id));
      } else {
        const result = insertStep.run(...insertValues);
        updatedIds.add(result.lastInsertRowid);
        report.inserted.push(item.step_key);
        report.steps.push(selectById.get(result.lastInsertRowid));
      }
    }

    if (deactivateUnmatched) {
      for (const step of existingSteps) {
        if (!updatedIds.has(step.id) && step.is_active !== 0) {
          db.prepare('UPDATE steps SET is_active = 0 WHERE id = ?').run(step.id);
          report.deactivated.push(step.step_key || step.title);
        }
      }
    }
  });

  importTxn();
  return report;
}
