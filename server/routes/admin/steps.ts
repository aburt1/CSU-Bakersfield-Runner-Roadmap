import { Router, Request, Response, NextFunction } from 'express';
import { requireRole } from '../../middleware/requireRole.js';
import { logAudit } from '../../utils/audit.js';
import { getUniqueStepKeyForTerm } from '../../utils/stepKeys.js';
import { paramBuilder } from '../../db/pool.js';
import { parseTermId } from '../../utils/queryHelpers.js';
import type { Step } from '../../types/models.js';

const router = Router();

// GET /api/admin/steps — list all steps (including inactive), optional ?term_id=
router.get('/steps', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const steps = termId
      ? await req.db.queryAll<Step>('SELECT * FROM steps WHERE term_id = $1 ORDER BY sort_order', [termId])
      : await req.db.queryAll<Step>('SELECT * FROM steps ORDER BY sort_order');
    res.json(steps);
  } catch (err) { next(err); }
});

// POST /api/admin/steps — create a new step (admissions_editor+)
router.post('/steps', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title, description, icon, sort_order, deadline, deadline_date,
      guide_content, links, required_tags, required_tag_mode,
      excluded_tags, contact_info, term_id, is_public, is_optional, step_key,
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!term_id) {
      return res.status(400).json({ error: 'term_id is required' });
    }

    const termId = parseInt(term_id, 10);
    const term = await req.db.queryOne<{ id: number }>('SELECT id FROM terms WHERE id = $1', [termId]);
    if (!term) {
      return res.status(400).json({ error: 'Invalid term_id' });
    }

    const nextStepKey = await getUniqueStepKeyForTerm(req.db, termId, {
      stepKey: step_key,
      title,
      fallback: 'step',
    });

    const maxOrder = await req.db.queryOne<{ max: number }>('SELECT MAX(sort_order) as max FROM steps WHERE term_id = $1', [termId]);
    const order = sort_order ?? (maxOrder!.max || 0) + 1;

    const result = await req.db.execute(
      `INSERT INTO steps (title, description, icon, sort_order, deadline, deadline_date, guide_content, links, required_tags, required_tag_mode, excluded_tags, contact_info, term_id, step_key, is_active, is_public, is_optional)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, $15, $16)
       RETURNING id`,
      [
        title, description || null, icon || null, order,
        deadline || null, deadline_date || null, guide_content || null,
        links ? JSON.stringify(links) : null,
        required_tags ? JSON.stringify(required_tags) : null,
        required_tag_mode === 'all' ? 'all' : 'any',
        excluded_tags ? JSON.stringify(excluded_tags) : null,
        contact_info ? JSON.stringify(contact_info) : null,
        termId, nextStepKey, is_public ? 1 : 0, is_optional ? 1 : 0,
      ]
    );

    const newId = (result.rows[0] as { id: number }).id;
    await logAudit(req.db, req, {
      entityType: 'step',
      entityId: newId,
      action: 'step_create',
      details: { title, stepKey: nextStepKey },
    });

    res.json({ success: true, id: newId });
  } catch (err) { next(err); }
});

// PUT /api/admin/steps/reorder — bulk update sort_order (admissions_editor+)
router.put('/steps/reorder', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of {id, sort_order}' });
    }

    await req.db.transaction(async (txDb) => {
      for (const item of order as { id: number; sort_order: number }[]) {
        await txDb.execute('UPDATE steps SET sort_order = $1 WHERE id = $2', [item.sort_order, item.id]);
      }
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/admin/steps/bulk-status — bulk activate/deactivate (admissions_editor+)
router.put('/steps/bulk-status', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stepIds, is_active } = req.body;

    if (!Array.isArray(stepIds) || (is_active !== 0 && is_active !== 1)) {
      return res.status(400).json({ error: 'stepIds (array) and is_active (0|1) required' });
    }

    await req.db.transaction(async (txDb) => {
      for (const id of stepIds as number[]) {
        await txDb.execute('UPDATE steps SET is_active = $1 WHERE id = $2', [is_active, id]);
        await logAudit(txDb, req, {
          entityType: 'step',
          entityId: id,
          action: is_active ? 'step_restore' : 'step_delete',
          details: { bulk: true },
        });
      }
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/admin/steps/:id — update a step (admissions_editor+)
router.put('/steps/:id', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const step = await req.db.queryOne<Step>('SELECT * FROM steps WHERE id = $1', [id]);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const requestedTermId = req.body.term_id !== undefined ? parseInt(req.body.term_id, 10) : step.term_id;
    if (!requestedTermId) {
      return res.status(400).json({ error: 'term_id is required' });
    }

    const term = await req.db.queryOne<{ id: number }>('SELECT id FROM terms WHERE id = $1', [requestedTermId]);
    if (!term) {
      return res.status(400).json({ error: 'Invalid term_id' });
    }

    const fields: string[] = ['title', 'description', 'icon', 'sort_order', 'deadline', 'deadline_date', 'guide_content', 'links', 'required_tags', 'required_tag_mode', 'excluded_tags', 'contact_info', 'term_id', 'is_active', 'is_public', 'is_optional'];
    const updates: string[] = [];
    const values: unknown[] = [];
    const p = paramBuilder();

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ${p.next()}`);
        const val = req.body[field];
        if (field === 'links' || field === 'required_tags' || field === 'excluded_tags' || field === 'contact_info') {
          values.push(val ? JSON.stringify(val) : null);
        } else if (field === 'required_tag_mode') {
          values.push(val === 'all' ? 'all' : 'any');
        } else {
          values.push(val);
        }
      }
    }

    const termChanged = requestedTermId !== step.term_id;
    const shouldUpdateStepKey = req.body.step_key !== undefined || !step.step_key || termChanged;
    if (shouldUpdateStepKey) {
      updates.push(`step_key = ${p.next()}`);
      values.push(
        await getUniqueStepKeyForTerm(req.db, requestedTermId, {
          stepKey: req.body.step_key ?? step.step_key,
          title: req.body.title ?? step.title,
          fallback: `step-${id}`,
          excludeStepId: id,
        })
      );
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await req.db.execute(`UPDATE steps SET ${updates.join(', ')} WHERE id = ${p.next()}`, values);

    // Detect restore vs regular update
    const action = req.body.is_active === 1 && step.is_active === 0 ? 'step_restore' : 'step_update';
    await logAudit(req.db, req, {
      entityType: 'step',
      entityId: id,
      action,
      details: { title: step.title, fields: shouldUpdateStepKey ? [...Object.keys(req.body), 'step_key'] : Object.keys(req.body) },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/admin/steps/:id — soft delete (admissions_editor+)
router.delete('/steps/:id', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const step = await req.db.queryOne<{ title: string }>('SELECT title FROM steps WHERE id = $1', [id]);
    await req.db.execute('UPDATE steps SET is_active = 0 WHERE id = $1', [id]);

    await logAudit(req.db, req, {
      entityType: 'step',
      entityId: id,
      action: 'step_delete',
      details: { title: step?.title },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/admin/steps/:id/duplicate — duplicate a step (admissions_editor+)
router.post('/steps/:id/duplicate', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const step = await req.db.queryOne<Step>('SELECT * FROM steps WHERE id = $1', [id]);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const maxOrder = await req.db.queryOne<{ max: number }>('SELECT MAX(sort_order) as max FROM steps WHERE term_id = $1', [step.term_id]);
    const newOrder = (maxOrder!.max || 0) + 1;
    const duplicatedStepKey = await getUniqueStepKeyForTerm(req.db, step.term_id, {
      stepKey: `${step.step_key || step.title}-copy`,
      title: `${step.title} Copy`,
      fallback: `step-${step.id}-copy`,
    });

    const result = await req.db.execute(
      `INSERT INTO steps (title, description, icon, sort_order, deadline, deadline_date, guide_content, links, required_tags, required_tag_mode, excluded_tags, contact_info, term_id, step_key, is_active, is_public, is_optional)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, $15, $16)
       RETURNING id`,
      [
        step.title + ' (Copy)', step.description, step.icon, newOrder,
        step.deadline, step.deadline_date, step.guide_content, step.links,
        step.required_tags, step.required_tag_mode || 'any', step.excluded_tags,
        step.contact_info, step.term_id, duplicatedStepKey,
        step.is_public || 0, step.is_optional || 0,
      ]
    );

    const newId = (result.rows[0] as { id: number }).id;
    await logAudit(req.db, req, {
      entityType: 'step',
      entityId: newId,
      action: 'step_create',
      details: { title: step.title + ' (Copy)', duplicatedFrom: id, stepKey: duplicatedStepKey },
    });

    res.json({ success: true, id: newId });
  } catch (err) { next(err); }
});

export default router;
