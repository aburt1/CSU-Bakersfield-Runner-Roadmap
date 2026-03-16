import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';

const router = Router();

// All admin routes require API key
router.use(adminAuth);

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

  res.json({ success: true, id: result.lastInsertRowid });
});

// PUT /api/admin/steps/:id — update a step
router.put('/steps/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const step = req.db.prepare('SELECT id FROM steps WHERE id = ?').get(id);
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

  res.json({ success: true });
});

// DELETE /api/admin/steps/:id — soft delete
router.delete('/steps/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  req.db.prepare('UPDATE steps SET is_active = 0 WHERE id = ?').run(id);
  res.json({ success: true });
});

// PUT /api/admin/steps/reorder — bulk update sort_order
router.put('/steps/reorder', (req, res) => {
  const { order } = req.body; // [{id, sort_order}, ...]

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

// ─── Student Progress ────────────────────────────────────

// POST /api/admin/students/:studentId/steps/:stepId/complete
router.post('/students/:studentId/steps/:stepId/complete', (req, res) => {
  const { studentId, stepId } = req.params;
  const step = parseInt(stepId, 10);

  const student = req.db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const stepRow = req.db.prepare('SELECT id FROM steps WHERE id = ?').get(step);
  if (!stepRow) {
    return res.status(404).json({ error: 'Step not found' });
  }

  req.db.prepare(`
    INSERT OR IGNORE INTO student_progress (student_id, step_id)
    VALUES (?, ?)
  `).run(studentId, step);

  res.json({ success: true, studentId, stepId: step, completedAt: new Date().toISOString() });
});

// DELETE /api/admin/students/:studentId/steps/:stepId/complete
router.delete('/students/:studentId/steps/:stepId/complete', (req, res) => {
  const { studentId, stepId } = req.params;
  const step = parseInt(stepId, 10);

  req.db.prepare(`
    DELETE FROM student_progress
    WHERE student_id = ? AND step_id = ?
  `).run(studentId, step);

  res.json({ success: true, studentId, stepId: step });
});

// GET /api/admin/students/:studentId/progress
router.get('/students/:studentId/progress', (req, res) => {
  const { studentId } = req.params;

  const student = req.db.prepare('SELECT id, display_name, email, azure_id, tags FROM students WHERE id = ?').get(studentId);
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

  const student = req.db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  req.db.prepare('UPDATE students SET tags = ? WHERE id = ?').run(
    Array.isArray(tags) ? JSON.stringify(tags) : null,
    studentId
  );

  res.json({ success: true });
});

// GET /api/admin/students
router.get('/students', (req, res) => {
  const { search } = req.query;

  let students;
  if (search) {
    students = req.db.prepare(`
      SELECT id, display_name, email, azure_id, tags, created_at
      FROM students
      WHERE display_name LIKE ? OR email LIKE ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(`%${search}%`, `%${search}%`);
  } else {
    students = req.db.prepare(`
      SELECT id, display_name, email, azure_id, tags, created_at
      FROM students
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
  }

  res.json(students);
});

export default router;
