import { Router } from 'express';
import bcrypt from 'bcrypt';
import { adminAuth } from '../middleware/adminAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { safeJsonParse } from '../utils/json.js';
import { logAudit } from '../utils/audit.js';
import { applyStudentProgressChange } from '../utils/progress.js';
import { getUniqueStepKeyForTerm } from '../utils/stepKeys.js';
import { getDerivedTags, getManualTags, getMergedTags } from '../utils/studentTags.js';
import { paramBuilder } from '../db/pool.js';

const router = Router();

// All admin routes require authentication
router.use(adminAuth);

// ─── Step CRUD ───────────────────────────────────────────

// GET /api/admin/steps — list all steps (including inactive), optional ?term_id=
router.get('/steps', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const steps = termId
      ? await req.db.queryAll('SELECT * FROM steps WHERE term_id = $1 ORDER BY sort_order', [termId])
      : await req.db.queryAll('SELECT * FROM steps ORDER BY sort_order');
    res.json(steps);
  } catch (err) { next(err); }
});

// POST /api/admin/steps — create a new step (admissions_editor+)
router.post('/steps', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
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
    const term = await req.db.queryOne('SELECT id FROM terms WHERE id = $1', [termId]);
    if (!term) {
      return res.status(400).json({ error: 'Invalid term_id' });
    }

    const nextStepKey = await getUniqueStepKeyForTerm(req.db, termId, {
      stepKey: step_key,
      title,
      fallback: 'step',
    });

    const maxOrder = await req.db.queryOne('SELECT MAX(sort_order) as max FROM steps WHERE term_id = $1', [termId]);
    const order = sort_order ?? (maxOrder.max || 0) + 1;

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

    const newId = result.rows[0].id;
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
router.put('/steps/reorder', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of {id, sort_order}' });
    }

    await req.db.transaction(async (txDb) => {
      for (const item of order) {
        await txDb.execute('UPDATE steps SET sort_order = $1 WHERE id = $2', [item.sort_order, item.id]);
      }
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/admin/steps/bulk-status — bulk activate/deactivate (admissions_editor+)
router.put('/steps/bulk-status', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const { stepIds, is_active } = req.body;

    if (!Array.isArray(stepIds) || (is_active !== 0 && is_active !== 1)) {
      return res.status(400).json({ error: 'stepIds (array) and is_active (0|1) required' });
    }

    await req.db.transaction(async (txDb) => {
      for (const id of stepIds) {
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
router.put('/steps/:id', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const step = await req.db.queryOne('SELECT * FROM steps WHERE id = $1', [id]);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const requestedTermId = req.body.term_id !== undefined ? parseInt(req.body.term_id, 10) : step.term_id;
    if (!requestedTermId) {
      return res.status(400).json({ error: 'term_id is required' });
    }

    const term = await req.db.queryOne('SELECT id FROM terms WHERE id = $1', [requestedTermId]);
    if (!term) {
      return res.status(400).json({ error: 'Invalid term_id' });
    }

    const fields = ['title', 'description', 'icon', 'sort_order', 'deadline', 'deadline_date', 'guide_content', 'links', 'required_tags', 'required_tag_mode', 'excluded_tags', 'contact_info', 'term_id', 'is_active', 'is_public', 'is_optional'];
    const updates = [];
    const values = [];
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
router.delete('/steps/:id', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const step = await req.db.queryOne('SELECT title FROM steps WHERE id = $1', [id]);
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
router.post('/steps/:id/duplicate', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const step = await req.db.queryOne('SELECT * FROM steps WHERE id = $1', [id]);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const maxOrder = await req.db.queryOne('SELECT MAX(sort_order) as max FROM steps WHERE term_id = $1', [step.term_id]);
    const newOrder = (maxOrder.max || 0) + 1;
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

    const newId = result.rows[0].id;
    await logAudit(req.db, req, {
      entityType: 'step',
      entityId: newId,
      action: 'step_create',
      details: { title: step.title + ' (Copy)', duplicatedFrom: id, stepKey: duplicatedStepKey },
    });

    res.json({ success: true, id: newId });
  } catch (err) { next(err); }
});

// ─── Student Progress ────────────────────────────────────

// POST /api/admin/students/:studentId/steps/:stepId/complete (admissions+)
router.post('/students/:studentId/steps/:stepId/complete', requireRole('admissions', 'admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const { studentId, stepId } = req.params;
    const step = parseInt(stepId, 10);
    const { note, status } = req.body || {};
    const progressStatus = status === 'waived' ? 'waived' : 'completed';

    const student = await req.db.queryOne('SELECT id, display_name FROM students WHERE id = $1', [studentId]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const stepRow = await req.db.queryOne('SELECT id, title, step_key FROM steps WHERE id = $1', [step]);
    if (!stepRow) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const progressChange = await applyStudentProgressChange(req.db, {
      studentId,
      stepId: step,
      status: progressStatus,
      note,
    });

    if (progressChange.error) {
      return res.status(400).json({ error: progressChange.error });
    }

    if (progressChange.result !== 'noop') {
      await logAudit(req.db, req, {
        entityType: 'student_progress',
        entityId: studentId,
        action: progressStatus === 'waived' ? 'waive' : 'complete',
        details: {
          stepId: step,
          stepKey: stepRow.step_key || null,
          stepTitle: stepRow.title,
          studentName: student.display_name,
          note: note || null,
          result: progressChange.result,
        },
      });
    }

    res.json({
      success: true,
      studentId,
      stepId: step,
      status: progressChange.status,
      result: progressChange.result,
      completedAt: progressChange.completedAt,
    });
  } catch (err) { next(err); }
});

// DELETE /api/admin/students/:studentId/steps/:stepId/complete (admissions+)
router.delete('/students/:studentId/steps/:stepId/complete', requireRole('admissions', 'admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const { studentId, stepId } = req.params;
    const step = parseInt(stepId, 10);
    const { note } = req.body || {};

    const student = await req.db.queryOne('SELECT display_name FROM students WHERE id = $1', [studentId]);
    const stepRow = await req.db.queryOne('SELECT title, step_key FROM steps WHERE id = $1', [step]);

    const progressChange = await applyStudentProgressChange(req.db, {
      studentId,
      stepId: step,
      status: 'not_completed',
      note,
    });

    if (progressChange.error) {
      return res.status(400).json({ error: progressChange.error });
    }

    if (progressChange.result !== 'noop') {
      await logAudit(req.db, req, {
        entityType: 'student_progress',
        entityId: studentId,
        action: 'uncomplete',
        details: {
          stepId: step,
          stepKey: stepRow?.step_key || null,
          stepTitle: stepRow?.title,
          studentName: student?.display_name,
          note: note || null,
          result: progressChange.result,
        },
      });
    }

    res.json({ success: true, studentId, stepId: step, result: progressChange.result, status: progressChange.status });
  } catch (err) { next(err); }
});

// GET /api/admin/students/:studentId/progress
router.get('/students/:studentId/progress', async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const student = await req.db.queryOne(
      `SELECT id, display_name, email, azure_id, tags, created_at, term_id,
              emplid, preferred_name, phone, applicant_type, major, residency, admit_term, last_synced_at
       FROM students WHERE id = $1`,
      [studentId]
    );
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const progress = await req.db.queryAll(
      `SELECT sp.step_id, sp.completed_at, sp.status, sp.note, s.title
       FROM student_progress sp
       JOIN steps s ON s.id = sp.step_id
       WHERE sp.student_id = $1
       ORDER BY sp.step_id`,
      [studentId]
    );

    res.json({
      student,
      manualTags: getManualTags(student),
      derivedTags: getDerivedTags(student),
      mergedTags: getMergedTags(student),
      progress,
    });
  } catch (err) { next(err); }
});

// PUT /api/admin/students/:studentId/profile (admissions+)
router.put('/students/:studentId/profile', requireRole('admissions', 'admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const student = await req.db.queryOne(
      `SELECT id, display_name, email, emplid, preferred_name, phone,
              applicant_type, major, residency, admit_term, last_synced_at
       FROM students WHERE id = $1`,
      [studentId]
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const fields = [
      'display_name', 'email', 'emplid', 'preferred_name', 'phone',
      'applicant_type', 'major', 'residency', 'admit_term', 'last_synced_at',
    ];

    const updates = [];
    const values = [];
    const p = paramBuilder();

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ${p.next()}`);
        values.push(req.body[field] || null);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No profile fields to update' });
    }

    values.push(studentId);
    await req.db.execute(`UPDATE students SET ${updates.join(', ')} WHERE id = ${p.next()}`, values);

    await logAudit(req.db, req, {
      entityType: 'student_profile',
      entityId: studentId,
      action: 'student_profile_update',
      details: {
        studentName: student.display_name,
        emplid: req.body.emplid !== undefined ? req.body.emplid : student.emplid,
        fields: Object.keys(req.body),
      },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/admin/students/:studentId/tags (admissions+)
router.put('/students/:studentId/tags', requireRole('admissions', 'admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { tags } = req.body;

    const student = await req.db.queryOne('SELECT id, tags, display_name FROM students WHERE id = $1', [studentId]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const oldTags = safeJsonParse(student.tags, []);

    await req.db.execute(
      'UPDATE students SET tags = $1 WHERE id = $2',
      [Array.isArray(tags) ? JSON.stringify(tags) : null, studentId]
    );

    await logAudit(req.db, req, {
      entityType: 'student_tags',
      entityId: studentId,
      action: 'tags_update',
      details: { oldTags, newTags: tags || [], studentName: student.display_name || null },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/admin/students — paginated, with progress counts
router.get('/students', async (req, res, next) => {
  try {
    const { search, term_id, sort = 'date_desc', overdue_only } = req.query;
    const termId = term_id ? parseInt(term_id, 10) : null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 25));
    const offset = (page - 1) * perPage;

    const baseQuery = `
      SELECT s.id, s.display_name, s.email, s.azure_id, s.tags, s.created_at, s.term_id,
             s.emplid, s.applicant_type, s.major, s.residency, s.admit_term,
             COALESCE(pc.completed, 0) as completed_steps,
             COALESCE(ov.overdue_count, 0) as overdue_step_count
      FROM students s
      LEFT JOIN (
        SELECT student_id, COUNT(*) as completed
        FROM student_progress sp
        JOIN steps st_req ON st_req.id = sp.step_id AND COALESCE(st_req.is_optional, 0) = 0
        GROUP BY student_id
      ) pc ON pc.student_id = s.id
      LEFT JOIN (
        SELECT s2.id as student_id, COUNT(st.id) as overdue_count
        FROM students s2
        JOIN steps st ON st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0 AND st.deadline_date IS NOT NULL AND st.deadline_date < CURRENT_DATE::text
          AND (st.term_id = s2.term_id OR st.term_id IS NULL)
        LEFT JOIN student_progress sp ON sp.student_id = s2.id AND sp.step_id = st.id
        WHERE sp.student_id IS NULL
        GROUP BY s2.id
      ) ov ON ov.student_id = s.id
    `;

    const where = [];
    const params = [];
    const p = paramBuilder();

    if (search) {
      where.push(`(s.display_name ILIKE ${p.next()} OR s.email ILIKE ${p.next()} OR COALESCE(s.emplid, '') ILIKE ${p.next()} OR COALESCE(s.major, '') ILIKE ${p.next()})`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (termId) {
      where.push(`s.term_id = ${p.next()}`);
      params.push(termId);
    }
    if (overdue_only === '1') {
      where.push('COALESCE(ov.overdue_count, 0) > 0');
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Sort mapping
    const sortMap = {
      date_desc: 's.created_at DESC',
      date_asc: 's.created_at ASC',
      name_asc: 's.display_name ASC',
      name_desc: 's.display_name DESC',
      progress_asc: 'completed_steps ASC',
      progress_desc: 'completed_steps DESC',
    };
    const orderBy = sortMap[sort] || sortMap.date_desc;

    // Count query
    const totalResult = await req.db.queryOne(
      `SELECT COUNT(*) as count FROM (${baseQuery} ${whereClause}) sub`,
      params
    );
    const total = parseInt(totalResult.count);

    // Data query
    const students = await req.db.queryAll(
      `${baseQuery} ${whereClause} ORDER BY ${orderBy} LIMIT ${p.next()} OFFSET ${p.next()}`,
      [...params, perPage, offset]
    );

    res.json({ students, total, page, per_page: perPage });
  } catch (err) { next(err); }
});

// ─── Audit Log ───────────────────────────────────────────

// GET /api/admin/audit
router.get('/audit', async (req, res, next) => {
  try {
    const { studentId, entityType, action, changedBy, q, limit = '50', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const off = parseInt(offset, 10) || 0;

    const where = [];
    const params = [];
    const p = paramBuilder();

    if (studentId) {
      where.push(`entity_id = ${p.next()} AND entity_type IN ('student_progress', 'student_tags', 'student_profile')`);
      params.push(studentId);
    }
    if (entityType) {
      where.push(`entity_type = ${p.next()}`);
      params.push(entityType);
    }
    if (action) {
      where.push(`action = ${p.next()}`);
      params.push(action);
    }
    if (changedBy) {
      where.push(`changed_by ILIKE ${p.next()}`);
      params.push(`%${changedBy}%`);
    }
    if (q) {
      where.push(`(entity_type ILIKE ${p.next()} OR action ILIKE ${p.next()} OR changed_by ILIKE ${p.next()} OR COALESCE(details, '') ILIKE ${p.next()})`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalResult = await req.db.queryOne(`SELECT COUNT(*) as count FROM audit_log ${whereClause}`, params);
    const total = parseInt(totalResult.count);
    const logs = await req.db.queryAll(
      `SELECT * FROM audit_log ${whereClause} ORDER BY created_at DESC LIMIT ${p.next()} OFFSET ${p.next()}`,
      [...params, lim, off]
    );

    res.json({ logs, total });
  } catch (err) { next(err); }
});

// ─── Stats ───────────────────────────────────────────────

// GET /api/admin/stats — optional ?term_id=
router.get('/stats', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const stepFilter = termId ? 'WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0 AND term_id = $1' : 'WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0';
    const studentFilter = termId ? 'WHERE term_id = $1' : '';
    const stepParams = termId ? [termId] : [];
    const studentParams = termId ? [termId] : [];

    const totalStudentsResult = await req.db.queryOne(`SELECT COUNT(*) as count FROM students ${studentFilter}`, studentParams);
    const totalStudents = parseInt(totalStudentsResult.count);
    const totalActiveStepsResult = await req.db.queryOne(`SELECT COUNT(*) as count FROM steps ${stepFilter}`, stepParams);
    const totalActiveSteps = parseInt(totalActiveStepsResult.count);

    const avgQuery = termId
      ? `SELECT COALESCE(AVG(pc.completed), 0) as avg_completed
         FROM students s
         LEFT JOIN (
           SELECT student_id, COUNT(*) as completed
           FROM student_progress sp
           JOIN steps st ON st.id = sp.step_id AND st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0 AND st.term_id = $1
           GROUP BY student_id
         ) pc ON pc.student_id = s.id
         WHERE s.term_id = $2`
      : `SELECT COALESCE(AVG(pc.completed), 0) as avg_completed
         FROM students s
         LEFT JOIN (
           SELECT student_id, COUNT(*) as completed
           FROM student_progress sp
           JOIN steps st ON st.id = sp.step_id AND st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0
           GROUP BY student_id
         ) pc ON pc.student_id = s.id`;

    const avgResult = await req.db.queryOne(avgQuery, termId ? [termId, termId] : []);

    const avgPercent = totalActiveSteps > 0
      ? Math.round((avgResult.avg_completed / totalActiveSteps) * 100)
      : 0;

    res.json({
      totalStudents,
      totalActiveSteps,
      avgCompletionPercent: avgPercent,
    });
  } catch (err) { next(err); }
});

// ─── Export ──────────────────────────────────────────────

// GET /api/admin/export/progress?term_id=&format=csv
router.get('/export/progress', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const studentFilter = termId ? 'WHERE term_id = $1' : '';
    const stepFilter = termId ? 'WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0 AND term_id = $1' : 'WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0';
    const params = termId ? [termId] : [];

    const steps = await req.db.queryAll(`SELECT id, title FROM steps ${stepFilter} ORDER BY sort_order`, params);
    const students = await req.db.queryAll(`SELECT id, display_name, email FROM students ${studentFilter} ORDER BY display_name`, params);

    // Get all progress
    const allProgress = await req.db.queryAll('SELECT student_id, step_id, status FROM student_progress');
    const progressMap = new Map();
    for (const p of allProgress) {
      const key = `${p.student_id}:${p.step_id}`;
      progressMap.set(key, p.status || 'completed');
    }

    // Build CSV
    const headers = ['Student Name', 'Email', ...steps.map(s => s.title), 'Total Complete', 'Percentage'];
    const rows = students.map(student => {
      let doneCount = 0;
      const stepCells = steps.map(step => {
        const status = progressMap.get(`${student.id}:${step.id}`);
        if (status === 'completed') { doneCount++; return 'Completed'; }
        if (status === 'waived') { doneCount++; return 'Waived'; }
        return '';
      });
      const pct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
      return [student.display_name, student.email, ...stepCells, doneCount, `${pct}%`];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const termName = termId
      ? ((await req.db.queryOne('SELECT name FROM terms WHERE id = $1', [termId]))?.name || 'unknown')
      : 'all';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="progress-${termName}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (err) { next(err); }
});

// ─── Analytics ───────────────────────────────────────────

// GET /api/admin/analytics/step-completion?term_id=
router.get('/analytics/step-completion', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const termFilter = termId ? 'AND s.term_id = $1' : '';
    const params = termId ? [termId] : [];

    const studentCountSql = termId
      ? 'SELECT COUNT(*) as count FROM students WHERE term_id = $1'
      : 'SELECT COUNT(*) as count FROM students';
    const totalStudentsResult = await req.db.queryOne(studentCountSql, params);
    const totalStudents = parseInt(totalStudentsResult.count);

    const steps = await req.db.queryAll(
      `SELECT s.id, s.title, s.sort_order,
        COUNT(DISTINCT sp.student_id) as completed_count
       FROM steps s
       LEFT JOIN student_progress sp ON sp.step_id = s.id
       WHERE s.is_active = 1 AND COALESCE(s.is_optional, 0) = 0 ${termFilter}
       GROUP BY s.id, s.title, s.sort_order
       ORDER BY s.sort_order`,
      params
    );

    res.json({ steps: steps.map(s => ({ ...s, completed_count: parseInt(s.completed_count), total_students: totalStudents })), totalStudents });
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/completion-trend?term_id=&days=30
router.get('/analytics/completion-trend', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const days = parseInt(req.query.days, 10) || 30;
    const termFilter = termId
      ? 'JOIN steps st ON st.id = sp.step_id AND st.term_id = $1 AND COALESCE(st.is_optional, 0) = 0'
      : 'JOIN steps st ON st.id = sp.step_id AND COALESCE(st.is_optional, 0) = 0';
    const params = termId ? [termId, days] : [days];
    const daysParam = termId ? '$2' : '$1';

    const rows = await req.db.queryAll(
      `SELECT DATE(sp.completed_at) as date, COUNT(*) as completions
       FROM student_progress sp
       ${termFilter}
       WHERE sp.completed_at >= CURRENT_DATE - (${daysParam}::integer * INTERVAL '1 day')
       GROUP BY DATE(sp.completed_at)
       ORDER BY date`,
      params
    );

    res.json(rows.map(r => ({ ...r, completions: parseInt(r.completions) })));
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/bottlenecks?term_id=
router.get('/analytics/bottlenecks', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const termFilter = termId ? 'AND s.term_id = $1' : '';
    const params = termId ? [termId] : [];

    const totalStudentsResult = await req.db.queryOne(
      termId ? 'SELECT COUNT(*) as count FROM students WHERE term_id = $1' : 'SELECT COUNT(*) as count FROM students',
      params
    );
    const totalStudents = parseInt(totalStudentsResult.count);

    const steps = await req.db.queryAll(
      `SELECT s.id, s.title, s.sort_order,
        COUNT(DISTINCT sp.student_id) as completed_count
       FROM steps s
       LEFT JOIN student_progress sp ON sp.step_id = s.id
       WHERE s.is_active = 1 AND COALESCE(s.is_optional, 0) = 0 ${termFilter}
       GROUP BY s.id, s.title, s.sort_order
       ORDER BY completed_count ASC
       LIMIT 5`,
      params
    );

    res.json({
      steps: steps.map(s => ({
        ...s,
        completed_count: parseInt(s.completed_count),
        total_students: totalStudents,
        completion_pct: totalStudents > 0 ? Math.round((parseInt(s.completed_count) / totalStudents) * 100) : 0,
      })),
      totalStudents,
    });
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/cohort-summary?term_id=
router.get('/analytics/cohort-summary', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const studentFilter = termId ? 'WHERE s.term_id = $1' : '';
    const stepFilter = termId ? 'AND st.term_id = $2' : '';
    const params = termId ? [termId, termId] : [];

    const totalActiveStepsResult = await req.db.queryOne(
      termId ? 'SELECT COUNT(*) as count FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0 AND term_id = $1' : 'SELECT COUNT(*) as count FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0',
      termId ? [termId] : []
    );
    const totalActiveSteps = parseInt(totalActiveStepsResult.count);

    const rows = await req.db.queryAll(
      `SELECT
        CASE
          WHEN COALESCE(pc.done, 0) = 0 THEN '0%'
          WHEN COALESCE(pc.done, 0)::float / ${totalActiveSteps || 1} <= 0.25 THEN '1-25%'
          WHEN COALESCE(pc.done, 0)::float / ${totalActiveSteps || 1} <= 0.50 THEN '26-50%'
          WHEN COALESCE(pc.done, 0)::float / ${totalActiveSteps || 1} <= 0.75 THEN '51-75%'
          ELSE '76-100%'
        END as bucket,
        COUNT(*) as student_count
       FROM students s
       LEFT JOIN (
         SELECT student_id, COUNT(*) as done
         FROM student_progress sp
         JOIN steps st ON st.id = sp.step_id AND st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0 ${stepFilter}
         GROUP BY student_id
       ) pc ON pc.student_id = s.id
       ${studentFilter}
       GROUP BY bucket
       ORDER BY bucket`,
      params
    );

    res.json(rows.map(r => ({ ...r, student_count: parseInt(r.student_count) })));
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/deadline-risk?term_id=&days=14
router.get('/analytics/deadline-risk', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const days = parseInt(req.query.days, 10) || 14;

    const termFilter = termId ? 'AND s.term_id = $1' : '';
    const params = termId ? [termId] : [];

    const steps = await req.db.queryAll(
      `SELECT s.id, s.title, s.deadline_date,
        COUNT(DISTINCT st.id) as total_students,
        COUNT(DISTINCT CASE WHEN sp.status != 'completed' THEN st.id END) as at_risk_count
       FROM steps s
       JOIN students st ON st.term_id = s.term_id
       LEFT JOIN student_progress sp ON sp.step_id = s.id AND sp.student_id = st.id
       WHERE s.is_active = 1 AND s.deadline_date IS NOT NULL
         AND s.deadline_date <= NOW() + INTERVAL '${days} days'
         AND s.deadline_date > NOW() ${termFilter}
       GROUP BY s.id, s.title, s.deadline_date
       ORDER BY s.deadline_date ASC`,
      params
    );

    const result = [];
    for (const step of steps) {
      const students = await req.db.queryAll(
        `SELECT st.id, st.name, st.email
         FROM students st
         LEFT JOIN student_progress sp ON sp.step_id = $1 AND sp.student_id = st.id
         WHERE st.term_id = $2 AND (sp.status IS NULL OR sp.status != 'completed')`,
        [step.id, termId]
      );
      result.push({
        ...step,
        total_students: parseInt(step.total_students),
        at_risk_count: parseInt(step.at_risk_count),
        students,
      });
    }

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/stalled-students?term_id=&days=7
router.get('/analytics/stalled-students', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const days = parseInt(req.query.days, 10) || 7;

    const { p, params } = termId ? { p: (n) => `$${n}`, params: [termId] } : { p: (n) => null, params: [] };
    const termFilter = termId ? `WHERE st.term_id = ${p(1)}` : '';
    const paramIndex = termId ? 2 : 1;

    const students = await req.db.queryAll(
      `SELECT st.id, st.name, st.email,
        MAX(sp.updated_at) as last_completion_date,
        COUNT(CASE WHEN sp.status = 'completed' THEN 1 END) as completed_count
       FROM students st
       LEFT JOIN student_progress sp ON sp.student_id = st.id
       ${termFilter}
       GROUP BY st.id, st.name, st.email
       HAVING COUNT(CASE WHEN sp.status = 'completed' THEN 1 END) = 0
         OR MAX(sp.updated_at) < NOW() - INTERVAL '${days} days'
       ORDER BY COALESCE(MAX(sp.updated_at), st.created_at) ASC`,
      params
    );

    const totalStepsResult = await req.db.queryOne(
      termId ? 'SELECT COUNT(*) as count FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0 AND term_id = $1' : 'SELECT COUNT(*) as count FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0',
      termId ? [termId] : []
    );
    const totalSteps = parseInt(totalStepsResult.count);

    res.json(students.map(s => ({
      ...s,
      completed_count: parseInt(s.completed_count),
      total_steps: totalSteps,
    })));
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/cohort-comparison?term_id=
router.get('/analytics/cohort-comparison', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;

    const totalStepsResult = await req.db.queryOne(
      termId ? 'SELECT COUNT(*) as count FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0 AND term_id = $1' : 'SELECT COUNT(*) as count FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0',
      termId ? [termId] : []
    );
    const totalSteps = parseInt(totalStepsResult.count);

    const tags = ['freshman', 'transfer', 'first-gen', 'honors', 'athlete', 'eop', 'veteran', 'out-of-state'];
    const result = [];

    for (const tag of tags) {
      const cohortResult = await req.db.queryOne(
        `SELECT COUNT(DISTINCT s.id) as student_count,
          ROUND(AVG(COALESCE(pc.done, 0)::float / ${totalSteps || 1}) * 100) as avg_completion_pct
         FROM students s
         LEFT JOIN (
           SELECT student_id, COUNT(*) as done
           FROM student_progress sp
           JOIN steps st ON st.id = sp.step_id AND st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0 ${termId ? 'AND st.term_id = $2' : ''}
           GROUP BY student_id
         ) pc ON pc.student_id = s.id
         WHERE (s.tags IS NULL OR s.tags LIKE $1) ${termId ? 'AND s.term_id = $2' : ''}`,
        termId ? [`%${tag}%`, termId] : [`%${tag}%`]
      );

      if (cohortResult.student_count > 0) {
        result.push({
          tag,
          student_count: parseInt(cohortResult.student_count),
          avg_completion_pct: parseInt(cohortResult.avg_completion_pct),
        });
      }
    }

    res.json(result.sort((a, b) => b.student_count - a.student_count));
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/completion-velocity?term_id=
router.get('/analytics/completion-velocity', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;

    const students = await req.db.queryAll(
      `SELECT st.id,
        EXTRACT(DAY FROM MAX(sp.updated_at) - MIN(sp.updated_at)) as days_elapsed
       FROM students st
       JOIN student_progress sp ON sp.student_id = st.id AND sp.status = 'completed'
       ${termId ? 'WHERE st.term_id = $1' : ''}
       GROUP BY st.id`,
      termId ? [termId] : []
    );

    const buckets = {
      '1-3 days': 0,
      '4-7 days': 0,
      '1-2 weeks': 0,
      '2-4 weeks': 0,
      '4+ weeks': 0,
    };

    for (const student of students) {
      const days = parseInt(student.days_elapsed) || 0;
      if (days <= 3) buckets['1-3 days']++;
      else if (days <= 7) buckets['4-7 days']++;
      else if (days <= 14) buckets['1-2 weeks']++;
      else if (days <= 28) buckets['2-4 weeks']++;
      else buckets['4+ weeks']++;
    }

    res.json(Object.entries(buckets).map(([bucket, count]) => ({ bucket, student_count: count })));
  } catch (err) { next(err); }
});

// ─── Terms ───────────────────────────────────────────────

// GET /api/admin/terms
router.get('/terms', async (req, res, next) => {
  try {
    const terms = await req.db.queryAll(`
      SELECT t.*,
        (SELECT COUNT(*) FROM steps s WHERE s.term_id = t.id AND s.is_active = 1) as step_count,
        (SELECT COUNT(*) FROM students st WHERE st.term_id = t.id) as student_count
      FROM terms t ORDER BY t.created_at DESC
    `);
    res.json(terms.map(t => ({ ...t, step_count: parseInt(t.step_count), student_count: parseInt(t.student_count) })));
  } catch (err) { next(err); }
});

// POST /api/admin/terms (admissions_editor+)
router.post('/terms', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const { name, start_date, end_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await req.db.execute(
      'INSERT INTO terms (name, start_date, end_date, is_active) VALUES ($1, $2, $3, 0) RETURNING id',
      [name, start_date || null, end_date || null]
    );
    const newId = result.rows[0].id;
    await logAudit(req.db, req, { entityType: 'term', entityId: newId, action: 'term_create', details: { name } });
    res.json({ success: true, id: newId });
  } catch (err) { next(err); }
});

// PUT /api/admin/terms/:id (admissions_editor+)
router.put('/terms/:id', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, start_date, end_date, is_active } = req.body;
    const term = await req.db.queryOne('SELECT * FROM terms WHERE id = $1', [id]);
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

    const updates = [];
    const values = [];
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
router.post('/terms/:id/clone', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const sourceTermId = parseInt(req.params.id, 10);
    const { name, start_date, end_date, step_ids } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!Array.isArray(step_ids) || step_ids.length === 0) {
      return res.status(400).json({ error: 'step_ids must be a non-empty array' });
    }

    const sourceTerm = await req.db.queryOne('SELECT * FROM terms WHERE id = $1', [sourceTermId]);
    if (!sourceTerm) {
      return res.status(404).json({ error: 'Source term not found' });
    }

    const p = paramBuilder();
    const placeholders = step_ids.map(() => p.next()).join(', ');
    const sourceSteps = await req.db.queryAll(
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

      const newTermId = termResult.rows[0].id;

      const clonedSteps = [];
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

        const clonedStep = await txDb.queryOne('SELECT * FROM steps WHERE id = $1', [stepResult.rows[0].id]);
        clonedSteps.push(clonedStep);
      }

      await logAudit(txDb, req, {
        entityType: 'term',
        entityId: newTermId,
        action: 'term_create',
        details: { name, clonedFrom: sourceTermId, stepCount: clonedSteps.length },
      });

      const newTerm = await txDb.queryOne('SELECT * FROM terms WHERE id = $1', [newTermId]);
      return { term: newTerm, steps: clonedSteps };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// DELETE /api/admin/terms/:id (admissions_editor+)
router.delete('/terms/:id', requireRole('admissions_editor', 'sysadmin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const term = await req.db.queryOne('SELECT * FROM terms WHERE id = $1', [id]);
    if (!term) {
      return res.status(404).json({ error: 'Term not found' });
    }

    const studentCountResult = await req.db.queryOne('SELECT COUNT(*) as count FROM students WHERE term_id = $1', [id]);
    if (parseInt(studentCountResult.count) > 0) {
      return res.status(409).json({ error: 'Cannot delete a term that still has students assigned' });
    }

    await req.db.transaction(async (txDb) => {
      const steps = await txDb.queryAll('SELECT id, title FROM steps WHERE term_id = $1', [id]);

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

// ─── Overdue Students ────────────────────────────────────

// GET /api/admin/students/overdue?term_id=
router.get('/students/overdue', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const termFilter = termId ? 'AND st.term_id = $1' : '';
    const studentTermFilter = termId ? 'AND s.term_id = $2' : '';
    const params = termId ? [termId, termId] : [];

    const rows = await req.db.queryAll(
      `SELECT s.id, s.display_name, s.email,
        COUNT(st.id) as overdue_count
       FROM students s
       JOIN steps st ON st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0 AND st.deadline_date IS NOT NULL AND st.deadline_date < CURRENT_DATE::text ${termFilter}
       LEFT JOIN student_progress sp ON sp.student_id = s.id AND sp.step_id = st.id
       WHERE sp.student_id IS NULL ${studentTermFilter}
       GROUP BY s.id, s.display_name, s.email
       ORDER BY overdue_count DESC`,
      params
    );

    res.json(rows.map(r => ({ ...r, overdue_count: parseInt(r.overdue_count) })));
  } catch (err) { next(err); }
});

// ─── Admin User Management (superadmin only) ─────────────

// GET /api/admin/users
router.get('/users', requireRole('sysadmin'), async (req, res, next) => {
  try {
    const users = await req.db.queryAll(
      'SELECT id, email, display_name, role, is_active, created_at FROM admin_users ORDER BY created_at'
    );
    res.json(users);
  } catch (err) { next(err); }
});

// POST /api/admin/users
router.post('/users', requireRole('sysadmin'), async (req, res, next) => {
  try {
    const { email, password, role, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'email, password, and displayName required' });
    }
    const validRoles = ['viewer', 'admissions', 'admissions_editor', 'sysadmin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const existing = await req.db.queryOne('SELECT id FROM admin_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await req.db.execute(
      'INSERT INTO admin_users (email, password_hash, role, display_name) VALUES ($1, $2, $3, $4) RETURNING id',
      [email.toLowerCase().trim(), hash, role || 'viewer', displayName]
    );

    const newId = result.rows[0].id;
    await logAudit(req.db, req, {
      entityType: 'admin_user',
      entityId: newId,
      action: 'admin_create',
      details: { email, role: role || 'viewer', displayName },
    });

    res.json({ success: true, id: newId });
  } catch (err) { next(err); }
});

// PUT /api/admin/users/:id
router.put('/users/:id', requireRole('sysadmin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await req.db.queryOne('SELECT * FROM admin_users WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const { role, displayName, is_active, password } = req.body;
    const updates = [];
    const values = [];
    const p = paramBuilder();

    if (role !== undefined) {
      const validRoles = ['viewer', 'admissions', 'admissions_editor', 'sysadmin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      }
      updates.push(`role = ${p.next()}`);
      values.push(role);
    }
    if (displayName !== undefined) {
      updates.push(`display_name = ${p.next()}`);
      values.push(displayName);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = ${p.next()}`);
      values.push(is_active ? 1 : 0);
    }
    if (password) {
      updates.push(`password_hash = ${p.next()}`);
      values.push(await bcrypt.hash(password, 10));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await req.db.execute(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ${p.next()}`, values);

    await logAudit(req.db, req, {
      entityType: 'admin_user',
      entityId: id,
      action: 'admin_update',
      details: { email: user.email, fields: Object.keys(req.body) },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
