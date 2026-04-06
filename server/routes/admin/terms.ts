import { Router, Request, Response, NextFunction } from 'express';
import { requireRole } from '../../middleware/requireRole.js';
import { logAudit } from '../../utils/audit.js';
import { paramBuilder } from '../../db/pool.js';
import type { Step, Term } from '../../types/models.js';

const router = Router();

// GET /api/admin/terms
router.get('/terms', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const terms = await req.db.queryAll<Term & { step_count: string; student_count: string }>(`
      SELECT t.*,
        (SELECT COUNT(*) FROM steps s WHERE s.term_id = t.id AND s.is_active = 1) as step_count,
        (SELECT COUNT(*) FROM students st WHERE st.term_id = t.id) as student_count
      FROM terms t ORDER BY t.created_at DESC
    `);
    res.json(terms.map(t => ({ ...t, step_count: parseInt(t.step_count), student_count: parseInt(t.student_count) })));
  } catch (err) { next(err); }
});

// POST /api/admin/terms (admissions_editor+)
router.post('/terms', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, start_date, end_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await req.db.execute(
      'INSERT INTO terms (name, start_date, end_date, is_active) VALUES ($1, $2, $3, 0) RETURNING id',
      [name, start_date || null, end_date || null]
    );
    const newId = (result.rows[0] as { id: number }).id;
    await logAudit(req.db, req, { entityType: 'term', entityId: newId, action: 'term_create', details: { name } });
    res.json({ success: true, id: newId });
  } catch (err) { next(err); }
});

// PUT /api/admin/terms/:id (admissions_editor+)
router.put('/terms/:id', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { name, start_date, end_date, is_active } = req.body;
    const term = await req.db.queryOne<Term>('SELECT * FROM terms WHERE id = $1', [id]);
    if (!term) {
      return res.status(404).json({ error: 'Term not found' });
    }

    if (is_active === 1 || is_active === true) {
      await req.db.transaction(async (txDb) => {
        await txDb.execute('UPDATE terms SET is_active = 0');
        await txDb.execute(
          `UPDATE terms
           SET name = COALESCE($1, name),
               start_date = $2,
               end_date = $3,
               is_active = 1
           WHERE id = $4`,
          [
            name !== undefined ? name : null,
            start_date !== undefined ? start_date : term.start_date,
            end_date !== undefined ? end_date : term.end_date,
            id,
          ]
        );
      });
      await logAudit(req.db, req, { entityType: 'term', entityId: id, action: 'term_update', details: { name: name !== undefined ? name : term.name, fields: Object.keys(req.body) } });
      return res.json({ success: true });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const p = paramBuilder();
    if (name !== undefined) { updates.push(`name = ${p.next()}`); values.push(name); }
    if (start_date !== undefined) { updates.push(`start_date = ${p.next()}`); values.push(start_date); }
    if (end_date !== undefined) { updates.push(`end_date = ${p.next()}`); values.push(end_date); }
    if (is_active !== undefined) { updates.push(`is_active = ${p.next()}`); values.push(is_active ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(id);
    await req.db.execute(`UPDATE terms SET ${updates.join(', ')} WHERE id = ${p.next()}`, values);
    await logAudit(req.db, req, { entityType: 'term', entityId: id, action: 'term_update', details: { name: name !== undefined ? name : term.name, fields: Object.keys(req.body) } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/admin/terms/:id/clone (admissions_editor+)
router.post('/terms/:id/clone', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sourceTermId = parseInt(req.params.id as string, 10);
    const { name, start_date, end_date, step_ids } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!Array.isArray(step_ids) || step_ids.length === 0) {
      return res.status(400).json({ error: 'step_ids must be a non-empty array' });
    }

    const sourceTerm = await req.db.queryOne<Term>('SELECT * FROM terms WHERE id = $1', [sourceTermId]);
    if (!sourceTerm) {
      return res.status(404).json({ error: 'Source term not found' });
    }

    const p = paramBuilder();
    const placeholders = (step_ids as number[]).map(() => p.next()).join(', ');
    const sourceSteps = await req.db.queryAll<Step>(
      `SELECT * FROM steps WHERE term_id = ${p.next()} AND id IN (${placeholders}) ORDER BY sort_order`,
      [...step_ids, sourceTermId]
    );

    if (sourceSteps.length === 0) {
      return res.status(400).json({ error: 'No matching steps found for source term' });
    }

    const result = await req.db.transaction(async (txDb) => {
      const termResult = await txDb.execute(
        'INSERT INTO terms (name, start_date, end_date, is_active) VALUES ($1, $2, $3, 0) RETURNING id',
        [name, start_date || null, end_date || null]
      );

      const newTermId = (termResult.rows[0] as { id: number }).id;

      const clonedSteps: Step[] = [];
      for (const step of sourceSteps) {
        const stepResult = await txDb.execute(
          `INSERT INTO steps (title, description, icon, sort_order, deadline, deadline_date, guide_content, links, required_tags, required_tag_mode, excluded_tags, contact_info, term_id, step_key, is_active, is_public, is_optional)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           RETURNING id`,
          [
            step.title, step.description, step.icon, step.sort_order,
            step.deadline, step.deadline_date, step.guide_content, step.links,
            step.required_tags, step.required_tag_mode || 'any', step.excluded_tags,
            step.contact_info, newTermId, step.step_key,
            step.is_active ?? 1, step.is_public ?? 0, step.is_optional ?? 0,
          ]
        );

        const clonedStep = await txDb.queryOne<Step>('SELECT * FROM steps WHERE id = $1', [(stepResult.rows[0] as { id: number }).id]);
        clonedSteps.push(clonedStep!);
      }

      await logAudit(txDb, req, {
        entityType: 'term',
        entityId: newTermId,
        action: 'term_create',
        details: { name, clonedFrom: sourceTermId, stepCount: clonedSteps.length },
      });

      const newTerm = await txDb.queryOne<Term>('SELECT * FROM terms WHERE id = $1', [newTermId]);
      return { term: newTerm, steps: clonedSteps };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// DELETE /api/admin/terms/:id (admissions_editor+)
router.delete('/terms/:id', requireRole('admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const term = await req.db.queryOne<Term>('SELECT * FROM terms WHERE id = $1', [id]);
    if (!term) {
      return res.status(404).json({ error: 'Term not found' });
    }

    const studentCountResult = await req.db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM students WHERE term_id = $1', [id]);
    if (parseInt(studentCountResult!.count) > 0) {
      return res.status(409).json({ error: 'Cannot delete a term that still has students assigned' });
    }

    await req.db.transaction(async (txDb) => {
      const steps = await txDb.queryAll<{ id: number; title: string }>('SELECT id, title FROM steps WHERE term_id = $1', [id]);

      for (const step of steps) {
        await txDb.execute('DELETE FROM student_progress WHERE step_id = $1', [step.id]);
        await txDb.execute('DELETE FROM steps WHERE id = $1', [step.id]);
        await logAudit(txDb, req, {
          entityType: 'step',
          entityId: step.id,
          action: 'step_delete',
          details: { title: step.title, deletedWithTerm: id },
        });
      }

      await txDb.execute('DELETE FROM terms WHERE id = $1', [id]);
      await logAudit(txDb, req, {
        entityType: 'term',
        entityId: id,
        action: 'term_delete',
        details: { name: term.name, deletedStepCount: steps.length },
      });
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
