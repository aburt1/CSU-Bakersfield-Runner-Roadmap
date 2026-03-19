import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/auth.js';
import { getMergedTags } from '../utils/studentTags.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-secure-random-string';

function getOptionalStudentId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
    return payload.studentId || null;
  } catch {
    return null;
  }
}

// GET /api/steps - Get all active admissions steps
// When called with auth, filters by student's term
router.get('/', (req, res) => {
  const studentId = getOptionalStudentId(req);
  let steps;

  if (studentId) {
    const student = req.db.prepare('SELECT term_id FROM students WHERE id = ?').get(studentId);
    if (student?.term_id) {
      steps = req.db.prepare(
        'SELECT * FROM steps WHERE (is_active = 1 OR is_active IS NULL) AND term_id = ? ORDER BY sort_order'
      ).all(student.term_id);
    } else {
      const activeTerm = req.db.prepare('SELECT id FROM terms WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
      steps = activeTerm
        ? req.db.prepare(
            'SELECT * FROM steps WHERE (is_active = 1 OR is_active IS NULL) AND term_id = ? ORDER BY sort_order'
          ).all(activeTerm.id)
        : req.db.prepare(
            'SELECT * FROM steps WHERE (is_active = 1 OR is_active IS NULL) ORDER BY sort_order'
          ).all();
    }
  } else {
    const activeTerm = req.db.prepare('SELECT id FROM terms WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
    steps = activeTerm
      ? req.db.prepare(
          'SELECT * FROM steps WHERE (is_active = 1 OR is_active IS NULL) AND term_id = ? ORDER BY sort_order'
        ).all(activeTerm.id)
      : req.db.prepare(
          'SELECT * FROM steps WHERE (is_active = 1 OR is_active IS NULL) ORDER BY sort_order'
        ).all();
  }

  res.json(steps);
});

// GET /api/steps/progress - Get current student's progress + tags + term info
router.get('/progress', authMiddleware, (req, res) => {
  const progress = req.db.prepare(`
    SELECT sp.step_id, sp.completed_at, sp.status
    FROM student_progress sp
    WHERE sp.student_id = ?
  `).all(req.studentId);

  const student = req.db.prepare('SELECT tags, applicant_type, major, residency, term_id FROM students WHERE id = ?').get(req.studentId);

  // Get term info
  let term = null;
  if (student?.term_id) {
    term = req.db.prepare('SELECT id, name, start_date, end_date FROM terms WHERE id = ?').get(student.term_id);
  }

  res.json({
    progress,
    tags: getMergedTags(student),
    term,
  });
});

export default router;
