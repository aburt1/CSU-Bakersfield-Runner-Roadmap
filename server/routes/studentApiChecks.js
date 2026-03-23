import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { runApiChecksForStudent, getRunState, setRunState } from '../utils/apiCheckRunner.js';

const router = express.Router();

router.use(authMiddleware);

// POST /api/roadmap/run-api-checks
router.post('/run-api-checks', async (req, res) => {
  try {
    const student = await req.db.queryOne(
      'SELECT id, email, emplid, term_id, last_api_check_at FROM students WHERE id = $1',
      [req.studentId]
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // 5-minute throttle
    if (student.last_api_check_at) {
      const elapsed = Date.now() - new Date(student.last_api_check_at).getTime();
      if (elapsed < 5 * 60 * 1000) {
        return res.json({ status: 'skipped' });
      }
    }

    // Guard against concurrent runs for the same student
    const currentRun = getRunState(student.email);
    if (currentRun.status === 'running') {
      return res.json({ status: 'started' });
    }

    // Start background check run
    setRunState(student.email, { status: 'running', checkedSteps: [], startedAt: Date.now() });

    runApiChecksForStudent(req.db, student)
      .then(result => {
        setRunState(student.email, { status: 'complete', checkedSteps: result.checkedSteps, startedAt: Date.now() });
      })
      .catch(err => {
        console.error('[api-check-runner]', err);
        setRunState(student.email, { status: 'complete', checkedSteps: [], startedAt: Date.now() });
      });

    res.json({ status: 'started' });
  } catch (err) {
    console.error('[run-api-checks]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/roadmap/check-status
router.get('/check-status', async (req, res) => {
  try {
    const student = await req.db.queryOne(
      'SELECT email FROM students WHERE id = $1',
      [req.studentId]
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const state = getRunState(student.email);
    res.json({ status: state.status, checkedSteps: state.checkedSteps });
  } catch (err) {
    console.error('[check-status]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
