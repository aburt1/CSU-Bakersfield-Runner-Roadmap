import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/steps - Get all admissions steps
router.get('/', (req, res) => {
  const steps = req.db.prepare('SELECT * FROM steps ORDER BY sort_order').all();
  res.json(steps);
});

// GET /api/steps/progress - Get current student's progress
router.get('/progress', authMiddleware, (req, res) => {
  const progress = req.db.prepare(`
    SELECT sp.step_id, sp.completed_at
    FROM student_progress sp
    WHERE sp.student_id = ?
  `).all(req.studentId);

  res.json(progress);
});

// POST /api/steps/:stepId/complete - Mark a step as complete
router.post('/:stepId/complete', authMiddleware, (req, res) => {
  const stepId = parseInt(req.params.stepId, 10);
  if (isNaN(stepId) || stepId < 1 || stepId > 9) {
    return res.status(400).json({ error: 'Invalid step ID' });
  }

  // Verify step exists
  const step = req.db.prepare('SELECT id FROM steps WHERE id = ?').get(stepId);
  if (!step) {
    return res.status(404).json({ error: 'Step not found' });
  }

  // Upsert progress
  req.db.prepare(`
    INSERT OR IGNORE INTO student_progress (student_id, step_id)
    VALUES (?, ?)
  `).run(req.studentId, stepId);

  res.json({ success: true, stepId, completedAt: new Date().toISOString() });
});

// DELETE /api/steps/:stepId/complete - Unmark a step
router.delete('/:stepId/complete', authMiddleware, (req, res) => {
  const stepId = parseInt(req.params.stepId, 10);
  if (isNaN(stepId) || stepId < 1 || stepId > 9) {
    return res.status(400).json({ error: 'Invalid step ID' });
  }

  req.db.prepare(`
    DELETE FROM student_progress
    WHERE student_id = ? AND step_id = ?
  `).run(req.studentId, stepId);

  res.json({ success: true, stepId });
});

export default router;
