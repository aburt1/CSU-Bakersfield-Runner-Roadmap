import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { applyStudentProgressChange } from '../utils/progress.js';
import { safeJsonParse } from '../utils/json.js';
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

function stepAppliesToStudent(step, studentTags) {
  const requiredTags = safeJsonParse(step.required_tags, []);
  const excludedTags = safeJsonParse(step.excluded_tags, []);
  const requiredTagMode = step.required_tag_mode === 'all' ? 'all' : 'any';

  if (excludedTags.some((tag) => studentTags.includes(tag))) return false;
  if (requiredTags.length === 0) return true;

  return requiredTagMode === 'all'
    ? requiredTags.every((tag) => studentTags.includes(tag))
    : requiredTags.some((tag) => studentTags.includes(tag));
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

// PUT /api/steps/:stepId/status - Student self-service updates for optional steps
router.put('/:stepId/status', authMiddleware, (req, res) => {
  const stepId = parseInt(req.params.stepId, 10);
  const { status } = req.body || {};

  if (!['completed', 'not_completed'].includes(status)) {
    return res.status(400).json({ error: 'status must be completed or not_completed' });
  }

  const student = req.db.prepare(`
    SELECT id, display_name, email, tags, applicant_type, major, residency, term_id, emplid
    FROM students
    WHERE id = ?
  `).get(req.studentId);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  if (!student.term_id) {
    return res.status(409).json({ error: 'Student does not have an assigned term' });
  }

  const step = req.db.prepare(`
    SELECT *
    FROM steps
    WHERE id = ? AND term_id = ?
  `).get(stepId, student.term_id);

  if (!step) {
    return res.status(404).json({ error: 'Step not found in the student term' });
  }

  if (step.is_active === 0) {
    return res.status(409).json({ error: 'Step is inactive' });
  }

  if (step.is_optional !== 1) {
    return res.status(403).json({ error: 'Students may only update optional steps' });
  }

  const studentTags = getMergedTags(student);
  if (!stepAppliesToStudent(step, studentTags)) {
    return res.status(403).json({ error: 'Step does not apply to this student' });
  }

  const progressChange = applyStudentProgressChange(req.db, {
    studentId: student.id,
    stepId,
    status,
  });

  if (progressChange.error) {
    return res.status(400).json({ error: progressChange.error });
  }

  req.studentUser = {
    displayName: student.display_name,
    email: student.email,
  };

  if (progressChange.result !== 'noop') {
    logAudit(req.db, req, {
      entityType: 'student_progress',
      entityId: student.id,
      action: status === 'completed' ? 'student_optional_complete' : 'student_optional_uncomplete',
      details: {
        studentName: student.display_name,
        student_id_number: student.emplid || null,
        stepId: step.id,
        stepTitle: step.title,
        step_key: step.step_key || null,
        result: progressChange.result,
      },
    });
  }

  return res.json({
    success: true,
    stepId,
    status: progressChange.status,
    result: progressChange.result,
    completedAt: progressChange.completedAt,
  });
});

export default router;
