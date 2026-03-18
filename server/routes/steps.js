import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/steps - Get all active admissions steps
// When called with auth, filters by student's term
router.get('/', (req, res) => {
  const steps = req.db.prepare(
    'SELECT * FROM steps WHERE is_active = 1 OR is_active IS NULL ORDER BY sort_order'
  ).all();
  res.json(steps);
});

// GET /api/steps/progress - Get current student's progress + tags + term info
router.get('/progress', authMiddleware, (req, res) => {
  const progress = req.db.prepare(`
    SELECT sp.step_id, sp.completed_at, sp.status
    FROM student_progress sp
    WHERE sp.student_id = ?
  `).all(req.studentId);

  const student = req.db.prepare('SELECT tags, term_id FROM students WHERE id = ?').get(req.studentId);

  // Get term info
  let term = null;
  if (student?.term_id) {
    term = req.db.prepare('SELECT id, name, start_date, end_date FROM terms WHERE id = ?').get(student.term_id);
  }

  res.json({
    progress,
    tags: student?.tags ? JSON.parse(student.tags) : [],
    term,
  });
});

export default router;
