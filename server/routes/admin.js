import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';

const router = Router();

// All admin routes require API key
router.use(adminAuth);

// ─── Audit Helper ───────────────────────────────────────

function logAudit(db, { entityType, entityId, action, details }) {
  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, details)
    VALUES (?, ?, ?, 'admin', ?)
  `).run(entityType, String(entityId), action, details ? JSON.stringify(details) : null);
}

// ─── Step CRUD ───────────────────────────────────────────

// GET /api/admin/steps — list all steps (including inactive)
router.get('/steps', (req, res) => {
  const steps = req.db.prepare('SELECT * FROM steps ORDER BY sort_order').all();
  res.json(steps);
});

// POST /api/admin/steps — create a new step
router.post('/steps', (req, res) => {
  const { title, description, icon, sort_order, deadline, guide_content, links, required_tags } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const maxOrder = req.db.prepare('SELECT MAX(sort_order) as max FROM steps').get();
  const order = sort_order ?? (maxOrder.max || 0) + 1;

  const result = req.db.prepare(`
    INSERT INTO steps (title, description, icon, sort_order, deadline, guide_content, links, required_tags, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    title,
    description || null,
    icon || null,
    order,
    deadline || null,
    guide_content || null,
    links ? JSON.stringify(links) : null,
    required_tags ? JSON.stringify(required_tags) : null
  );

  logAudit(req.db, {
    entityType: 'step',
    entityId: result.lastInsertRowid,
    action: 'step_create',
    details: { title },
  });

  res.json({ success: true, id: result.lastInsertRowid });
});

// PUT /api/admin/steps/:id — update a step
router.put('/steps/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const step = req.db.prepare('SELECT * FROM steps WHERE id = ?').get(id);
  if (!step) {
    return res.status(404).json({ error: 'Step not found' });
  }

  const fields = ['title', 'description', 'icon', 'sort_order', 'deadline', 'guide_content', 'links', 'required_tags', 'is_active'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      const val = req.body[field];
      if (field === 'links' || field === 'required_tags') {
        values.push(val ? JSON.stringify(val) : null);
      } else {
        values.push(val);
      }
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id);
  req.db.prepare(`UPDATE steps SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // Detect restore vs regular update
  const action = req.body.is_active === 1 && step.is_active === 0 ? 'step_restore' : 'step_update';
  logAudit(req.db, {
    entityType: 'step',
    entityId: id,
    action,
    details: { title: step.title, fields: Object.keys(req.body) },
  });

  res.json({ success: true });
});

// DELETE /api/admin/steps/:id — soft delete
router.delete('/steps/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const step = req.db.prepare('SELECT title FROM steps WHERE id = ?').get(id);
  req.db.prepare('UPDATE steps SET is_active = 0 WHERE id = ?').run(id);

  logAudit(req.db, {
    entityType: 'step',
    entityId: id,
    action: 'step_delete',
    details: { title: step?.title },
  });

  res.json({ success: true });
});

// PUT /api/admin/steps/reorder — bulk update sort_order
router.put('/steps/reorder', (req, res) => {
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

// POST /api/admin/steps/:id/duplicate — duplicate a step
router.post('/steps/:id/duplicate', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const step = req.db.prepare('SELECT * FROM steps WHERE id = ?').get(id);
  if (!step) {
    return res.status(404).json({ error: 'Step not found' });
  }

  const maxOrder = req.db.prepare('SELECT MAX(sort_order) as max FROM steps').get();
  const newOrder = (maxOrder.max || 0) + 1;

  const result = req.db.prepare(`
    INSERT INTO steps (title, description, icon, sort_order, deadline, guide_content, links, required_tags, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    step.title + ' (Copy)',
    step.description,
    step.icon,
    newOrder,
    step.deadline,
    step.guide_content,
    step.links,
    step.required_tags
  );

  logAudit(req.db, {
    entityType: 'step',
    entityId: result.lastInsertRowid,
    action: 'step_create',
    details: { title: step.title + ' (Copy)', duplicatedFrom: id },
  });

  res.json({ success: true, id: result.lastInsertRowid });
});

// PUT /api/admin/steps/bulk-status — bulk activate/deactivate
router.put('/steps/bulk-status', (req, res) => {
  const { stepIds, is_active } = req.body;

  if (!Array.isArray(stepIds) || (is_active !== 0 && is_active !== 1)) {
    return res.status(400).json({ error: 'stepIds (array) and is_active (0|1) required' });
  }

  const update = req.db.prepare('UPDATE steps SET is_active = ? WHERE id = ?');
  const bulkUpdate = req.db.transaction((ids) => {
    for (const id of ids) {
      update.run(is_active, id);
      logAudit(req.db, {
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

// ─── Student Progress ────────────────────────────────────

// POST /api/admin/students/:studentId/steps/:stepId/complete
router.post('/students/:studentId/steps/:stepId/complete', (req, res) => {
  const { studentId, stepId } = req.params;
  const step = parseInt(stepId, 10);
  const { note } = req.body || {};

  const student = req.db.prepare('SELECT id, display_name FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const stepRow = req.db.prepare('SELECT id, title FROM steps WHERE id = ?').get(step);
  if (!stepRow) {
    return res.status(404).json({ error: 'Step not found' });
  }

  req.db.prepare(`
    INSERT OR IGNORE INTO student_progress (student_id, step_id)
    VALUES (?, ?)
  `).run(studentId, step);

  logAudit(req.db, {
    entityType: 'student_progress',
    entityId: studentId,
    action: 'complete',
    details: { stepId: step, stepTitle: stepRow.title, studentName: student.display_name, note: note || null },
  });

  res.json({ success: true, studentId, stepId: step, completedAt: new Date().toISOString() });
});

// DELETE /api/admin/students/:studentId/steps/:stepId/complete
router.delete('/students/:studentId/steps/:stepId/complete', (req, res) => {
  const { studentId, stepId } = req.params;
  const step = parseInt(stepId, 10);
  const { note } = req.body || {};

  const student = req.db.prepare('SELECT display_name FROM students WHERE id = ?').get(studentId);
  const stepRow = req.db.prepare('SELECT title FROM steps WHERE id = ?').get(step);

  req.db.prepare(`
    DELETE FROM student_progress
    WHERE student_id = ? AND step_id = ?
  `).run(studentId, step);

  logAudit(req.db, {
    entityType: 'student_progress',
    entityId: studentId,
    action: 'uncomplete',
    details: { stepId: step, stepTitle: stepRow?.title, studentName: student?.display_name, note: note || null },
  });

  res.json({ success: true, studentId, stepId: step });
});

// GET /api/admin/students/:studentId/progress
router.get('/students/:studentId/progress', (req, res) => {
  const { studentId } = req.params;

  const student = req.db.prepare('SELECT id, display_name, email, azure_id, tags, created_at FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const progress = req.db.prepare(`
    SELECT sp.step_id, sp.completed_at, s.title
    FROM student_progress sp
    JOIN steps s ON s.id = sp.step_id
    WHERE sp.student_id = ?
    ORDER BY sp.step_id
  `).all(studentId);

  res.json({ student, progress });
});

// PUT /api/admin/students/:studentId/tags
router.put('/students/:studentId/tags', (req, res) => {
  const { studentId } = req.params;
  const { tags } = req.body;

  const student = req.db.prepare('SELECT id, tags FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const oldTags = student.tags ? JSON.parse(student.tags) : [];

  req.db.prepare('UPDATE students SET tags = ? WHERE id = ?').run(
    Array.isArray(tags) ? JSON.stringify(tags) : null,
    studentId
  );

  logAudit(req.db, {
    entityType: 'student_tags',
    entityId: studentId,
    action: 'tags_update',
    details: { oldTags, newTags: tags || [] },
  });

  res.json({ success: true });
});

// GET /api/admin/students — with progress counts
router.get('/students', (req, res) => {
  const { search } = req.query;

  const baseQuery = `
    SELECT s.id, s.display_name, s.email, s.azure_id, s.tags, s.created_at,
           COALESCE(pc.completed, 0) as completed_steps
    FROM students s
    LEFT JOIN (
      SELECT student_id, COUNT(*) as completed
      FROM student_progress
      GROUP BY student_id
    ) pc ON pc.student_id = s.id
  `;

  let students;
  if (search) {
    students = req.db.prepare(`
      ${baseQuery}
      WHERE s.display_name LIKE ? OR s.email LIKE ?
      ORDER BY s.created_at DESC
      LIMIT 100
    `).all(`%${search}%`, `%${search}%`);
  } else {
    students = req.db.prepare(`
      ${baseQuery}
      ORDER BY s.created_at DESC
      LIMIT 100
    `).all();
  }

  res.json(students);
});

// ─── Audit Log ───────────────────────────────────────────

// GET /api/admin/audit
router.get('/audit', (req, res) => {
  const { studentId, entityType, limit = '50', offset = '0' } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = parseInt(offset, 10) || 0;

  let where = [];
  let params = [];

  if (studentId) {
    where.push(`entity_id = ? AND entity_type IN ('student_progress', 'student_tags')`);
    params.push(studentId);
  }
  if (entityType) {
    where.push('entity_type = ?');
    params.push(entityType);
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

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  const totalStudents = req.db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  const totalActiveSteps = req.db.prepare('SELECT COUNT(*) as count FROM steps WHERE is_active = 1').get().count;

  const avgResult = req.db.prepare(`
    SELECT COALESCE(AVG(pc.completed), 0) as avg_completed
    FROM students s
    LEFT JOIN (
      SELECT student_id, COUNT(*) as completed
      FROM student_progress sp
      JOIN steps st ON st.id = sp.step_id AND st.is_active = 1
      GROUP BY student_id
    ) pc ON pc.student_id = s.id
  `).get();

  const avgPercent = totalActiveSteps > 0
    ? Math.round((avgResult.avg_completed / totalActiveSteps) * 100)
    : 0;

  res.json({
    totalStudents,
    totalActiveSteps,
    avgCompletionPercent: avgPercent,
  });
});

export default router;
