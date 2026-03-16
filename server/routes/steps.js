import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/steps - Get all active admissions steps
router.get('/', (req, res) => {
  const steps = req.db.prepare(
    'SELECT * FROM steps WHERE is_active = 1 OR is_active IS NULL ORDER BY sort_order'
  ).all();
  res.json(steps);
});

// GET /api/steps/progress - Get current student's progress + tags
router.get('/progress', authMiddleware, (req, res) => {
  const progress = req.db.prepare(`
    SELECT sp.step_id, sp.completed_at
    FROM student_progress sp
    WHERE sp.student_id = ?
  `).all(req.studentId);

  const student = req.db.prepare('SELECT tags FROM students WHERE id = ?').get(req.studentId);

  res.json({
    progress,
    tags: student?.tags ? JSON.parse(student.tags) : [],
  });
});

export default router;
