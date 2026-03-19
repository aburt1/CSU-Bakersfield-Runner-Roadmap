import { Router } from 'express';
import bcrypt from 'bcrypt';
import { adminAuth } from '../middleware/adminAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { safeJsonParse } from '../utils/json.js';
import { logAudit } from '../utils/audit.js';
import { applyStudentProgressChange } from '../utils/progress.js';
import { getUniqueStepKeyForTerm } from '../utils/stepKeys.js';
import { getDerivedTags, getManualTags, getMergedTags } from '../utils/studentTags.js';

const router = Router();

// All admin routes require authentication
router.use(adminAuth);

// ─── Step CRUD ───────────────────────────────────────────

// GET /api/admin/steps — list all steps (including inactive), optional ?term_id=
router.get('/steps', (req, res) => {
  const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
  const steps = termId
    ? req.db.prepare('SELECT * FROM steps WHERE term_id = ? ORDER BY sort_order').all(termId)
    : req.db.prepare('SELECT * FROM steps ORDER BY sort_order').all();
  res.json(steps);
});

// POST /api/admin/steps — create a new step (admissions_editor+)
router.post('/steps', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const {
    title,
    description,
    icon,
    sort_order,
    deadline,
    deadline_date,
    guide_content,
    links,
    required_tags,
    required_tag_mode,
    excluded_tags,
    contact_info,
    term_id,
    is_public,
    step_key,
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!term_id) {
    return res.status(400).json({ error: 'term_id is required' });
  }

  const termId = parseInt(term_id, 10);
  const term = req.db.prepare('SELECT id FROM terms WHERE id = ?').get(termId);
  if (!term) {
    return res.status(400).json({ error: 'Invalid term_id' });
  }

  const nextStepKey = getUniqueStepKeyForTerm(req.db, termId, {
    stepKey: step_key,
    title,
    fallback: 'step',
  });

  const maxOrder = req.db.prepare('SELECT MAX(sort_order) as max FROM steps WHERE term_id = ?').get(termId);
  const order = sort_order ?? (maxOrder.max || 0) + 1;

  const result = req.db.prepare(`
    INSERT INTO steps (title, description, icon, sort_order, deadline, deadline_date, guide_content, links, required_tags, required_tag_mode, excluded_tags, contact_info, term_id, step_key, is_active, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    title,
    description || null,
    icon || null,
    order,
    deadline || null,
    deadline_date || null,
    guide_content || null,
    links ? JSON.stringify(links) : null,
    required_tags ? JSON.stringify(required_tags) : null,
    required_tag_mode === 'all' ? 'all' : 'any',
    excluded_tags ? JSON.stringify(excluded_tags) : null,
    contact_info ? JSON.stringify(contact_info) : null,
    termId,
    nextStepKey,
    is_public ? 1 : 0
  );

  logAudit(req.db, req, {
    entityType: 'step',
    entityId: result.lastInsertRowid,
    action: 'step_create',
    details: { title, stepKey: nextStepKey },
  });

  res.json({ success: true, id: result.lastInsertRowid });
});

// PUT /api/admin/steps/reorder — bulk update sort_order (admissions_editor+)
// NOTE: Must be defined BEFORE /steps/:id to avoid Express matching "reorder" as :id
router.put('/steps/reorder', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const { order } = req.body;

  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'order must be an array of {id, sort_order}' });
  }

  const update = req.db.prepare('UPDATE steps SET sort_order = ? WHERE id = ?');
  const reorder = req.db.transaction((items) => {
    for (const item of items) {
      update.run(item.sort_order, item.id);
    }
  });
  reorder(order);

  res.json({ success: true });
});

// PUT /api/admin/steps/bulk-status — bulk activate/deactivate (admissions_editor+)
// NOTE: Must be defined BEFORE /steps/:id to avoid Express matching "bulk-status" as :id
router.put('/steps/bulk-status', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const { stepIds, is_active } = req.body;

  if (!Array.isArray(stepIds) || (is_active !== 0 && is_active !== 1)) {
    return res.status(400).json({ error: 'stepIds (array) and is_active (0|1) required' });
  }

  const update = req.db.prepare('UPDATE steps SET is_active = ? WHERE id = ?');
  const bulkUpdate = req.db.transaction((ids) => {
    for (const id of ids) {
      update.run(is_active, id);
      logAudit(req.db, req, {
        entityType: 'step',
        entityId: id,
        action: is_active ? 'step_restore' : 'step_delete',
        details: { bulk: true },
      });
    }
  });
  bulkUpdate(stepIds);

  res.json({ success: true });
});

// PUT /api/admin/steps/:id — update a step (admissions_editor+)
router.put('/steps/:id', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const step = req.db.prepare('SELECT * FROM steps WHERE id = ?').get(id);
  if (!step) {
    return res.status(404).json({ error: 'Step not found' });
  }

  const requestedTermId = req.body.term_id !== undefined ? parseInt(req.body.term_id, 10) : step.term_id;
  if (!requestedTermId) {
    return res.status(400).json({ error: 'term_id is required' });
  }

  const term = req.db.prepare('SELECT id FROM terms WHERE id = ?').get(requestedTermId);
  if (!term) {
    return res.status(400).json({ error: 'Invalid term_id' });
  }

  const fields = ['title', 'description', 'icon', 'sort_order', 'deadline', 'deadline_date', 'guide_content', 'links', 'required_tags', 'required_tag_mode', 'excluded_tags', 'contact_info', 'term_id', 'is_active', 'is_public'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
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
    updates.push('step_key = ?');
    values.push(
      getUniqueStepKeyForTerm(req.db, requestedTermId, {
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
  req.db.prepare(`UPDATE steps SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // Detect restore vs regular update
  const action = req.body.is_active === 1 && step.is_active === 0 ? 'step_restore' : 'step_update';
  logAudit(req.db, req, {
    entityType: 'step',
    entityId: id,
    action,
    details: { title: step.title, fields: shouldUpdateStepKey ? [...Object.keys(req.body), 'step_key'] : Object.keys(req.body) },
  });

  res.json({ success: true });
});

// DELETE /api/admin/steps/:id — soft delete (admissions_editor+)
router.delete('/steps/:id', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const step = req.db.prepare('SELECT title FROM steps WHERE id = ?').get(id);
  req.db.prepare('UPDATE steps SET is_active = 0 WHERE id = ?').run(id);

  logAudit(req.db, req, {
    entityType: 'step',
    entityId: id,
    action: 'step_delete',
    details: { title: step?.title },
  });

  res.json({ success: true });
});

// POST /api/admin/steps/:id/duplicate — duplicate a step (admissions_editor+)
router.post('/steps/:id/duplicate', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const step = req.db.prepare('SELECT * FROM steps WHERE id = ?').get(id);
  if (!step) {
    return res.status(404).json({ error: 'Step not found' });
  }

  const maxOrder = req.db.prepare('SELECT MAX(sort_order) as max FROM steps WHERE term_id = ?').get(step.term_id);
  const newOrder = (maxOrder.max || 0) + 1;
  const duplicatedStepKey = getUniqueStepKeyForTerm(req.db, step.term_id, {
    stepKey: `${step.step_key || step.title}-copy`,
    title: `${step.title} Copy`,
    fallback: `step-${step.id}-copy`,
  });

  const result = req.db.prepare(`
    INSERT INTO steps (title, description, icon, sort_order, deadline, deadline_date, guide_content, links, required_tags, required_tag_mode, excluded_tags, contact_info, term_id, step_key, is_active, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    step.title + ' (Copy)',
    step.description,
    step.icon,
    newOrder,
    step.deadline,
    step.deadline_date,
    step.guide_content,
    step.links,
    step.required_tags,
    step.required_tag_mode || 'any',
    step.excluded_tags,
    step.contact_info,
    step.term_id,
    duplicatedStepKey,
    step.is_public || 0
  );

  logAudit(req.db, req, {
    entityType: 'step',
    entityId: result.lastInsertRowid,
    action: 'step_create',
    details: { title: step.title + ' (Copy)', duplicatedFrom: id, stepKey: duplicatedStepKey },
  });

  res.json({ success: true, id: result.lastInsertRowid });
});

// ─── Student Progress ────────────────────────────────────

// POST /api/admin/students/:studentId/steps/:stepId/complete (admissions+)
router.post('/students/:studentId/steps/:stepId/complete', requireRole('admissions', 'admissions_editor', 'sysadmin'), (req, res) => {
  const { studentId, stepId } = req.params;
  const step = parseInt(stepId, 10);
  const { note, status } = req.body || {};
  const progressStatus = status === 'waived' ? 'waived' : 'completed';

  const student = req.db.prepare('SELECT id, display_name FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const stepRow = req.db.prepare('SELECT id, title, step_key FROM steps WHERE id = ?').get(step);
  if (!stepRow) {
    return res.status(404).json({ error: 'Step not found' });
  }

  const progressChange = applyStudentProgressChange(req.db, {
    studentId,
    stepId: step,
    status: progressStatus,
    note,
  });

  if (progressChange.error) {
    return res.status(400).json({ error: progressChange.error });
  }

  if (progressChange.result !== 'noop') {
    logAudit(req.db, req, {
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
});

// DELETE /api/admin/students/:studentId/steps/:stepId/complete (admissions+)
router.delete('/students/:studentId/steps/:stepId/complete', requireRole('admissions', 'admissions_editor', 'sysadmin'), (req, res) => {
  const { studentId, stepId } = req.params;
  const step = parseInt(stepId, 10);
  const { note } = req.body || {};

  const student = req.db.prepare('SELECT display_name FROM students WHERE id = ?').get(studentId);
  const stepRow = req.db.prepare('SELECT title, step_key FROM steps WHERE id = ?').get(step);

  const progressChange = applyStudentProgressChange(req.db, {
    studentId,
    stepId: step,
    status: 'not_completed',
    note,
  });

  if (progressChange.error) {
    return res.status(400).json({ error: progressChange.error });
  }

  if (progressChange.result !== 'noop') {
    logAudit(req.db, req, {
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
});

// GET /api/admin/students/:studentId/progress
router.get('/students/:studentId/progress', (req, res) => {
  const { studentId } = req.params;

  const student = req.db.prepare(`
    SELECT
      id, display_name, email, azure_id, tags, created_at, term_id,
      emplid, preferred_name, phone, applicant_type, major, residency, admit_term, last_synced_at
    FROM students
    WHERE id = ?
  `).get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const progress = req.db.prepare(`
    SELECT sp.step_id, sp.completed_at, sp.status, sp.note, s.title
    FROM student_progress sp
    JOIN steps s ON s.id = sp.step_id
    WHERE sp.student_id = ?
    ORDER BY sp.step_id
  `).all(studentId);

  res.json({
    student,
    manualTags: getManualTags(student),
    derivedTags: getDerivedTags(student),
    mergedTags: getMergedTags(student),
    progress,
  });
});

// PUT /api/admin/students/:studentId/profile (admissions+)
router.put('/students/:studentId/profile', requireRole('admissions', 'admissions_editor', 'sysadmin'), (req, res) => {
  const { studentId } = req.params;
  const student = req.db.prepare(`
    SELECT
      id, display_name, email, emplid, preferred_name, phone,
      applicant_type, major, residency, admit_term, last_synced_at
    FROM students
    WHERE id = ?
  `).get(studentId);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const fields = [
    'display_name',
    'email',
    'emplid',
    'preferred_name',
    'phone',
    'applicant_type',
    'major',
    'residency',
    'admit_term',
    'last_synced_at',
  ];

  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field] || null);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No profile fields to update' });
  }

  values.push(studentId);
  req.db.prepare(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  logAudit(req.db, req, {
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
});

// PUT /api/admin/students/:studentId/tags (admissions+)
router.put('/students/:studentId/tags', requireRole('admissions', 'admissions_editor', 'sysadmin'), (req, res) => {
  const { studentId } = req.params;
  const { tags } = req.body;

  const student = req.db.prepare('SELECT id, tags, display_name FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const oldTags = safeJsonParse(student.tags, []);

  req.db.prepare('UPDATE students SET tags = ? WHERE id = ?').run(
    Array.isArray(tags) ? JSON.stringify(tags) : null,
    studentId
  );

  logAudit(req.db, req, {
    entityType: 'student_tags',
    entityId: studentId,
    action: 'tags_update',
    details: { oldTags, newTags: tags || [], studentName: student.display_name || null },
  });

  res.json({ success: true });
});

// GET /api/admin/students — paginated, with progress counts
// Query params: search, term_id, page (default 1), per_page (default 25),
//   sort (date_desc|date_asc|name_asc|name_desc|progress_asc|progress_desc), overdue_only (0|1)
router.get('/students', (req, res) => {
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
      FROM student_progress
      GROUP BY student_id
    ) pc ON pc.student_id = s.id
    LEFT JOIN (
      SELECT s2.id as student_id, COUNT(st.id) as overdue_count
      FROM students s2
      JOIN steps st ON st.is_active = 1 AND st.deadline_date IS NOT NULL AND st.deadline_date < date('now')
        AND (st.term_id = s2.term_id OR st.term_id IS NULL)
      LEFT JOIN student_progress sp ON sp.student_id = s2.id AND sp.step_id = st.id
      WHERE sp.student_id IS NULL
      GROUP BY s2.id
    ) ov ON ov.student_id = s.id
  `;

  const where = [];
  const params = [];
  if (search) {
    where.push('(s.display_name LIKE ? OR s.email LIKE ? OR COALESCE(s.emplid, \'\') LIKE ? OR COALESCE(s.major, \'\') LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (termId) {
    where.push('s.term_id = ?');
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
  const total = req.db.prepare(`
    SELECT COUNT(*) as count FROM (${baseQuery} ${whereClause})
  `).get(...params).count;

  // Data query
  const students = req.db.prepare(`
    ${baseQuery}
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);

  res.json({ students, total, page, per_page: perPage });
});

// ─── Audit Log ───────────────────────────────────────────

// GET /api/admin/audit
router.get('/audit', (req, res) => {
  const { studentId, entityType, action, changedBy, q, limit = '50', offset = '0' } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = parseInt(offset, 10) || 0;

  let where = [];
  let params = [];

  if (studentId) {
    where.push(`entity_id = ? AND entity_type IN ('student_progress', 'student_tags', 'student_profile')`);
    params.push(studentId);
  }
  if (entityType) {
    where.push('entity_type = ?');
    params.push(entityType);
  }
  if (action) {
    where.push('action = ?');
    params.push(action);
  }
  if (changedBy) {
    where.push('changed_by LIKE ?');
    params.push(`%${changedBy}%`);
  }
  if (q) {
    where.push('(entity_type LIKE ? OR action LIKE ? OR changed_by LIKE ? OR COALESCE(details, \'\') LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const total = req.db.prepare(`SELECT COUNT(*) as count FROM audit_log ${whereClause}`).get(...params).count;
  const logs = req.db.prepare(`
    SELECT * FROM audit_log ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, off);

  res.json({ logs, total });
});

// ─── Stats ───────────────────────────────────────────────

// GET /api/admin/stats — optional ?term_id=
router.get('/stats', (req, res) => {
  const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
  const stepFilter = termId ? 'WHERE is_active = 1 AND term_id = ?' : 'WHERE is_active = 1';
  const studentFilter = termId ? 'WHERE term_id = ?' : '';
  const stepParams = termId ? [termId] : [];
  const studentParams = termId ? [termId] : [];

  const totalStudents = req.db.prepare(`SELECT COUNT(*) as count FROM students ${studentFilter}`).get(...studentParams).count;
  const totalActiveSteps = req.db.prepare(`SELECT COUNT(*) as count FROM steps ${stepFilter}`).get(...stepParams).count;

  const avgQuery = termId
    ? `SELECT COALESCE(AVG(pc.completed), 0) as avg_completed
       FROM students s
       LEFT JOIN (
         SELECT student_id, COUNT(*) as completed
         FROM student_progress sp
         JOIN steps st ON st.id = sp.step_id AND st.is_active = 1 AND st.term_id = ?
         GROUP BY student_id
       ) pc ON pc.student_id = s.id
       WHERE s.term_id = ?`
    : `SELECT COALESCE(AVG(pc.completed), 0) as avg_completed
       FROM students s
       LEFT JOIN (
         SELECT student_id, COUNT(*) as completed
         FROM student_progress sp
         JOIN steps st ON st.id = sp.step_id AND st.is_active = 1
         GROUP BY student_id
       ) pc ON pc.student_id = s.id`;

  const avgResult = req.db.prepare(avgQuery).get(...(termId ? [termId, termId] : []));

  const avgPercent = totalActiveSteps > 0
    ? Math.round((avgResult.avg_completed / totalActiveSteps) * 100)
    : 0;

  res.json({
    totalStudents,
    totalActiveSteps,
    avgCompletionPercent: avgPercent,
  });
});

// ─── Export ──────────────────────────────────────────────

// GET /api/admin/export/progress?term_id=&format=csv
router.get('/export/progress', (req, res) => {
  const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
  const studentFilter = termId ? 'WHERE term_id = ?' : '';
  const stepFilter = termId ? 'WHERE is_active = 1 AND term_id = ?' : 'WHERE is_active = 1';
  const studentParams = termId ? [termId] : [];
  const stepParams = termId ? [termId] : [];

  const steps = req.db.prepare(`SELECT id, title FROM steps ${stepFilter} ORDER BY sort_order`).all(...stepParams);
  const students = req.db.prepare(`SELECT id, display_name, email FROM students ${studentFilter} ORDER BY display_name`).all(...studentParams);

  // Get all progress
  const allProgress = req.db.prepare('SELECT student_id, step_id, status FROM student_progress').all();
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
    ? (req.db.prepare('SELECT name FROM terms WHERE id = ?').get(termId)?.name || 'unknown')
    : 'all';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="progress-${termName}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csvContent);
});

// ─── Analytics ───────────────────────────────────────────

// GET /api/admin/analytics/step-completion?term_id=
router.get('/analytics/step-completion', (req, res) => {
  const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
  const termFilter = termId ? 'AND s.term_id = ?' : '';
  const studentTermFilter = termId ? 'WHERE st.term_id = ?' : '';
  const params = termId ? [termId] : [];
  const studentParams = termId ? [termId] : [];

  const studentCountSql = termId
    ? 'SELECT COUNT(*) as count FROM students WHERE term_id = ?'
    : 'SELECT COUNT(*) as count FROM students';
  const totalStudents = req.db.prepare(studentCountSql).get(...studentParams).count;

  const steps = req.db.prepare(`
    SELECT s.id, s.title, s.sort_order,
      COUNT(DISTINCT sp.student_id) as completed_count
    FROM steps s
    LEFT JOIN student_progress sp ON sp.step_id = s.id
    WHERE s.is_active = 1 ${termFilter}
    GROUP BY s.id
    ORDER BY s.sort_order
  `).all(...params);

  res.json({ steps: steps.map(s => ({ ...s, total_students: totalStudents })), totalStudents });
});

// GET /api/admin/analytics/completion-trend?term_id=&days=30
router.get('/analytics/completion-trend', (req, res) => {
  const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
  const days = parseInt(req.query.days, 10) || 30;
  const termFilter = termId ? 'JOIN steps st ON st.id = sp.step_id AND st.term_id = ?' : '';
  const params = termId ? [termId, days] : [days];

  const rows = req.db.prepare(`
    SELECT date(sp.completed_at) as date, COUNT(*) as completions
    FROM student_progress sp
    ${termFilter}
    WHERE sp.completed_at >= date('now', '-' || ? || ' days')
    GROUP BY date(sp.completed_at)
    ORDER BY date
  `).all(...params);

  res.json(rows);
});

// GET /api/admin/analytics/bottlenecks?term_id=
router.get('/analytics/bottlenecks', (req, res) => {
  const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
  const termFilter = termId ? 'AND s.term_id = ?' : '';
  const params = termId ? [termId] : [];

  const totalStudents = req.db.prepare(
    termId ? 'SELECT COUNT(*) as count FROM students WHERE term_id = ?' : 'SELECT COUNT(*) as count FROM students'
  ).get(...params).count;

  const steps = req.db.prepare(`
    SELECT s.id, s.title, s.sort_order,
      COUNT(DISTINCT sp.student_id) as completed_count
    FROM steps s
    LEFT JOIN student_progress sp ON sp.step_id = s.id
    WHERE s.is_active = 1 ${termFilter}
    GROUP BY s.id
    ORDER BY completed_count ASC
    LIMIT 5
  `).all(...params);

  res.json({
    steps: steps.map(s => ({
      ...s,
      total_students: totalStudents,
      completion_pct: totalStudents > 0 ? Math.round((s.completed_count / totalStudents) * 100) : 0,
    })),
    totalStudents,
  });
});

// GET /api/admin/analytics/cohort-summary?term_id=
router.get('/analytics/cohort-summary', (req, res) => {
  const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
  const studentFilter = termId ? 'WHERE s.term_id = ?' : '';
  const stepFilter = termId ? 'AND st.term_id = ?' : '';
  const params = termId ? [termId, termId] : [];

  const totalActiveSteps = req.db.prepare(
    termId ? 'SELECT COUNT(*) as count FROM steps WHERE is_active = 1 AND term_id = ?' : 'SELECT COUNT(*) as count FROM steps WHERE is_active = 1'
  ).get(...(termId ? [termId] : [])).count;

  const rows = req.db.prepare(`
    SELECT
      CASE
        WHEN COALESCE(pc.done, 0) = 0 THEN '0%'
        WHEN CAST(COALESCE(pc.done, 0) AS REAL) / ${totalActiveSteps || 1} <= 0.25 THEN '1-25%'
        WHEN CAST(COALESCE(pc.done, 0) AS REAL) / ${totalActiveSteps || 1} <= 0.50 THEN '26-50%'
        WHEN CAST(COALESCE(pc.done, 0) AS REAL) / ${totalActiveSteps || 1} <= 0.75 THEN '51-75%'
        ELSE '76-100%'
      END as bucket,
      COUNT(*) as student_count
    FROM students s
    LEFT JOIN (
      SELECT student_id, COUNT(*) as done
      FROM student_progress sp
      JOIN steps st ON st.id = sp.step_id AND st.is_active = 1 ${stepFilter}
      GROUP BY student_id
    ) pc ON pc.student_id = s.id
    ${studentFilter}
    GROUP BY bucket
    ORDER BY bucket
  `).all(...params);

  res.json(rows);
});

// ─── Terms ───────────────────────────────────────────────

// GET /api/admin/terms
router.get('/terms', (req, res) => {
  const terms = req.db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM steps s WHERE s.term_id = t.id AND s.is_active = 1) as step_count,
      (SELECT COUNT(*) FROM students st WHERE st.term_id = t.id) as student_count
    FROM terms t ORDER BY t.created_at DESC
  `).all();
  res.json(terms);
});

// POST /api/admin/terms (admissions_editor+)
router.post('/terms', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const { name, start_date, end_date } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = req.db.prepare(
    'INSERT INTO terms (name, start_date, end_date, is_active) VALUES (?, ?, ?, 0)'
  ).run(name, start_date || null, end_date || null);
  logAudit(req.db, req, { entityType: 'term', entityId: result.lastInsertRowid, action: 'term_create', details: { name } });
  res.json({ success: true, id: result.lastInsertRowid });
});

// PUT /api/admin/terms/:id (admissions_editor+)
router.put('/terms/:id', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, start_date, end_date, is_active } = req.body;
  const term = req.db.prepare('SELECT * FROM terms WHERE id = ?').get(id);
  if (!term) {
    return res.status(404).json({ error: 'Term not found' });
  }

  if (is_active === 1 || is_active === true) {
    const activate = req.db.transaction(() => {
      req.db.prepare('UPDATE terms SET is_active = 0').run();
      req.db.prepare(`
        UPDATE terms
        SET
          name = COALESCE(?, name),
          start_date = ?,
          end_date = ?,
          is_active = 1
        WHERE id = ?
      `).run(
        name !== undefined ? name : null,
        start_date !== undefined ? start_date : term.start_date,
        end_date !== undefined ? end_date : term.end_date,
        id
      );
    });
    activate();
    logAudit(req.db, req, { entityType: 'term', entityId: id, action: 'term_update', details: { name: name !== undefined ? name : term.name, fields: Object.keys(req.body) } });
    return res.json({ success: true });
  }

  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (start_date !== undefined) { updates.push('start_date = ?'); values.push(start_date); }
  if (end_date !== undefined) { updates.push('end_date = ?'); values.push(end_date); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(id);
  req.db.prepare(`UPDATE terms SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  logAudit(req.db, req, { entityType: 'term', entityId: id, action: 'term_update', details: { name: name !== undefined ? name : term.name, fields: Object.keys(req.body) } });
  res.json({ success: true });
});

// POST /api/admin/terms/:id/clone (admissions_editor+)
router.post('/terms/:id/clone', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const sourceTermId = parseInt(req.params.id, 10);
  const { name, start_date, end_date, step_ids } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!Array.isArray(step_ids) || step_ids.length === 0) {
    return res.status(400).json({ error: 'step_ids must be a non-empty array' });
  }

  const sourceTerm = req.db.prepare('SELECT * FROM terms WHERE id = ?').get(sourceTermId);
  if (!sourceTerm) {
    return res.status(404).json({ error: 'Source term not found' });
  }

  const placeholders = step_ids.map(() => '?').join(', ');
  const sourceSteps = req.db.prepare(`
    SELECT *
    FROM steps
    WHERE term_id = ? AND id IN (${placeholders})
    ORDER BY sort_order
  `).all(sourceTermId, ...step_ids);

  if (sourceSteps.length === 0) {
    return res.status(400).json({ error: 'No matching steps found for source term' });
  }

  const cloneResult = req.db.transaction(() => {
    const termResult = req.db.prepare(
      'INSERT INTO terms (name, start_date, end_date, is_active) VALUES (?, ?, ?, 0)'
    ).run(name, start_date || null, end_date || null);

    const newTermId = termResult.lastInsertRowid;
    const insertStep = req.db.prepare(`
      INSERT INTO steps (title, description, icon, sort_order, deadline, deadline_date, guide_content, links, required_tags, required_tag_mode, excluded_tags, contact_info, term_id, step_key, is_active, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const clonedSteps = sourceSteps.map((step) => {
      const result = insertStep.run(
        step.title,
        step.description,
        step.icon,
        step.sort_order,
        step.deadline,
        step.deadline_date,
        step.guide_content,
        step.links,
        step.required_tags,
        step.required_tag_mode || 'any',
        step.excluded_tags,
        step.contact_info,
        newTermId,
        step.step_key,
        step.is_active ?? 1,
        step.is_public ?? 0
      );

      return req.db.prepare('SELECT * FROM steps WHERE id = ?').get(result.lastInsertRowid);
    });

    logAudit(req.db, req, {
      entityType: 'term',
      entityId: newTermId,
      action: 'term_create',
      details: { name, clonedFrom: sourceTermId, stepCount: clonedSteps.length },
    });

    return {
      term: req.db.prepare('SELECT * FROM terms WHERE id = ?').get(newTermId),
      steps: clonedSteps,
    };
  });

  const result = cloneResult();
  res.json(result);
});

// DELETE /api/admin/terms/:id (admissions_editor+)
router.delete('/terms/:id', requireRole('admissions_editor', 'sysadmin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const term = req.db.prepare('SELECT * FROM terms WHERE id = ?').get(id);
  if (!term) {
    return res.status(404).json({ error: 'Term not found' });
  }

  const studentCount = req.db.prepare('SELECT COUNT(*) as count FROM students WHERE term_id = ?').get(id).count;
  if (studentCount > 0) {
    return res.status(409).json({ error: 'Cannot delete a term that still has students assigned' });
  }

  const deleteTerm = req.db.transaction(() => {
    const steps = req.db.prepare('SELECT id, title FROM steps WHERE term_id = ?').all(id);

    for (const step of steps) {
      req.db.prepare('DELETE FROM student_progress WHERE step_id = ?').run(step.id);
      req.db.prepare('DELETE FROM steps WHERE id = ?').run(step.id);
      logAudit(req.db, req, {
        entityType: 'step',
        entityId: step.id,
        action: 'step_delete',
        details: { title: step.title, deletedWithTerm: id },
      });
    }

    req.db.prepare('DELETE FROM terms WHERE id = ?').run(id);
    logAudit(req.db, req, {
      entityType: 'term',
      entityId: id,
      action: 'term_delete',
      details: { name: term.name, deletedStepCount: steps.length },
    });
  });

  deleteTerm();
  res.json({ success: true });
});

// ─── Overdue Students ────────────────────────────────────

// GET /api/admin/students/overdue?term_id=
router.get('/students/overdue', (req, res) => {
  const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
  const termFilter = termId ? 'AND st.term_id = ?' : '';
  const studentTermFilter = termId ? 'AND s.term_id = ?' : '';
  const params = termId ? [termId, termId] : [];

  const rows = req.db.prepare(`
    SELECT s.id, s.display_name, s.email,
      COUNT(st.id) as overdue_count
    FROM students s
    JOIN steps st ON st.is_active = 1 AND st.deadline_date IS NOT NULL AND st.deadline_date < date('now') ${termFilter}
    LEFT JOIN student_progress sp ON sp.student_id = s.id AND sp.step_id = st.id
    WHERE sp.student_id IS NULL ${studentTermFilter}
    GROUP BY s.id
    ORDER BY overdue_count DESC
  `).all(...params);

  res.json(rows);
});

// ─── Admin User Management (superadmin only) ─────────────

// GET /api/admin/users
router.get('/users', requireRole('sysadmin'), (req, res) => {
  const users = req.db.prepare(
    'SELECT id, email, display_name, role, is_active, created_at FROM admin_users ORDER BY created_at'
  ).all();
  res.json(users);
});

// POST /api/admin/users
router.post('/users', requireRole('sysadmin'), (req, res) => {
  const { email, password, role, displayName } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'email, password, and displayName required' });
  }
  const validRoles = ['viewer', 'admissions', 'admissions_editor', 'sysadmin'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  const existing = req.db.prepare('SELECT id FROM admin_users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'Email already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = req.db.prepare(
    'INSERT INTO admin_users (email, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
  ).run(email.toLowerCase().trim(), hash, role || 'viewer', displayName);

  logAudit(req.db, req, {
    entityType: 'admin_user',
    entityId: result.lastInsertRowid,
    action: 'admin_create',
    details: { email, role: role || 'viewer', displayName },
  });

  res.json({ success: true, id: result.lastInsertRowid });
});

// PUT /api/admin/users/:id
router.put('/users/:id', requireRole('sysadmin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = req.db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'Admin user not found' });
  }

  const { role, displayName, is_active, password } = req.body;
  const updates = [];
  const values = [];

  if (role !== undefined) {
    const validRoles = ['viewer', 'admissions', 'admissions_editor', 'sysadmin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }
    updates.push('role = ?');
    values.push(role);
  }
  if (displayName !== undefined) {
    updates.push('display_name = ?');
    values.push(displayName);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(is_active ? 1 : 0);
  }
  if (password) {
    updates.push('password_hash = ?');
    values.push(bcrypt.hashSync(password, 10));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id);
  req.db.prepare(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  logAudit(req.db, req, {
    entityType: 'admin_user',
    entityId: id,
    action: 'admin_update',
    details: { email: user.email, fields: Object.keys(req.body) },
  });

  res.json({ success: true });
});

export default router;
