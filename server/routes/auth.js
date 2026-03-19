import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, signToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/dev-login - Dev/POC login (no Azure AD required)
// Accepts { name, email } and returns a JWT token
router.post('/dev-login', (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_LOGIN !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  // Find existing student by email or create new one
  let student = req.db.prepare('SELECT id, display_name, email FROM students WHERE email = ?').get(email);

  if (!student) {
    const studentId = uuidv4();
    // Assign to the active term
    const activeTerm = req.db.prepare('SELECT id FROM terms WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
    const termId = activeTerm?.id || null;
    req.db.prepare(`
      INSERT INTO students (id, display_name, email, term_id)
      VALUES (?, ?, ?, ?)
    `).run(studentId, name, email, termId);

    // Auto-complete the accepted step for new students
    const acceptedStep = req.db.prepare(`
      SELECT id
      FROM steps
      WHERE term_id = ? AND step_key = 'accepted'
      ORDER BY id
      LIMIT 1
    `).get(termId);

    if (acceptedStep?.id) {
      req.db.prepare(`
        INSERT OR IGNORE INTO student_progress (student_id, step_id)
        VALUES (?, ?)
      `).run(studentId, acceptedStep.id);
    }

    student = { id: studentId, display_name: name, email };
  }

  const token = signToken(student.id, student.email);

  res.json({
    token,
    student: {
      id: student.id,
      displayName: student.display_name,
      email: student.email,
    },
  });
});

// GET /api/auth/me - Get current session info
router.get('/me', authMiddleware, (req, res) => {
  const student = req.db.prepare(
    'SELECT id, display_name, email, created_at FROM students WHERE id = ?'
  ).get(req.studentId);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  res.json({
    id: student.id,
    displayName: student.display_name,
    email: student.email,
    createdAt: student.created_at,
  });
});

export default router;
