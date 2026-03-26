import { readFileSync } from 'fs';
import type { Db } from '../types/db.js';
import type { Step } from '../types/models.js';

interface ChecklistManifestItem {
  step_key: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  sort_order: number;
  deadline?: string | null;
  deadline_date?: string | null;
  guide_content?: string | null;
  required_tags?: string[];
  required_tag_mode?: 'any' | 'all';
  match_titles?: string[];
  is_public?: boolean;
  is_optional?: boolean;
}

interface ImportReport {
  inserted: string[];
  updated: string[];
  deactivated: string[];
  steps: Step[];
}

const FALL_2026_CHECKLIST_PATH = new URL('../manifests/fall2026-onboarding-checklist.json', import.meta.url);

function readChecklistManifest(): ChecklistManifestItem[] {
  return JSON.parse(readFileSync(FALL_2026_CHECKLIST_PATH, 'utf8')) as ChecklistManifestItem[];
}

function normalizeTitle(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildRequiredTags(requiredTags: string[] | undefined): string | null {
  return Array.isArray(requiredTags) && requiredTags.length > 0
    ? JSON.stringify(requiredTags)
    : null;
}

export function getFall2026ChecklistManifest(): ChecklistManifestItem[] {
  return readChecklistManifest();
}

export async function importFall2026Checklist(
  db: Db,
  termId: number,
  { deactivateUnmatched = true }: { deactivateUnmatched?: boolean } = {}
): Promise<ImportReport> {
  const manifest = readChecklistManifest();
  const existingSteps = await db.queryAll<Step>('SELECT * FROM steps WHERE term_id = $1 ORDER BY sort_order, id', [termId]);
  const updatedIds = new Set<number>();
  const report: ImportReport = {
    inserted: [],
    updated: [],
    deactivated: [],
    steps: [],
  };

  return await db.transaction(async (txDb) => {
    for (const item of manifest) {
      const existing = existingSteps.find((step) => {
        if (step.step_key && step.step_key === item.step_key) return true;
        const itemTitles = [item.title, ...(item.match_titles || [])].map(normalizeTitle);
        return itemTitles.includes(normalizeTitle(step.title));
      });

      const updateValues: unknown[] = [
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

      if (existing) {
        await txDb.execute(
          `UPDATE steps
           SET title = $1, description = $2, icon = $3, sort_order = $4,
               deadline = $5, deadline_date = $6, guide_content = $7,
               required_tags = $8, required_tag_mode = $9, excluded_tags = $10,
               contact_info = $11, links = $12, step_key = $13,
               is_public = $14, is_optional = $15, is_active = 1
           WHERE id = $16`,
          [...updateValues, existing.id]
        );
        updatedIds.add(existing.id);
        report.updated.push(item.step_key);
        const updatedRow = await txDb.queryOne<Step>('SELECT * FROM steps WHERE id = $1', [existing.id]);
        report.steps.push(updatedRow!);
      } else {
        const result = await txDb.execute(
          `INSERT INTO steps (
            title, description, icon, sort_order, deadline, deadline_date, guide_content,
            required_tags, required_tag_mode, excluded_tags, contact_info, links,
            term_id, step_key, is_active, is_public, is_optional
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, $15, $16)
          RETURNING id`,
          [
            ...updateValues.slice(0, 12),
            termId,
            ...updateValues.slice(12),
          ]
        );
        const newId = (result.rows[0] as { id: number }).id;
        updatedIds.add(newId);
        report.inserted.push(item.step_key);
        const insertedRow = await txDb.queryOne<Step>('SELECT * FROM steps WHERE id = $1', [newId]);
        report.steps.push(insertedRow!);
      }
    }

    if (deactivateUnmatched) {
      for (const step of existingSteps) {
        if (!updatedIds.has(step.id) && step.is_active !== 0) {
          await txDb.execute('UPDATE steps SET is_active = 0 WHERE id = $1', [step.id]);
          report.deactivated.push(step.step_key || step.title);
        }
      }
    }

    return report;
  });
}
