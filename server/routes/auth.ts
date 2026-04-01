import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, signToken } from '../middleware/auth.js';
import { verifyAzureAdToken } from '../utils/azureAdToken.js';

const router = Router();

// POST /api/auth/dev-login - Dev/POC login (no Azure AD required)
// Accepts { name, email } and returns a JWT token
router.post('/dev-login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }

    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Find existing student by email or create new one
    let student = await req.db.queryOne<{ id: string; display_name: string; email: string }>(
      'SELECT id, display_name, email FROM students WHERE email = $1',
      [email]
    );

    if (!student) {
      const studentId = uuidv4();
      // Assign to the active term
      const activeTerm = await req.db.queryOne<{ id: number }>(
        'SELECT id FROM terms WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
      );
      const termId = activeTerm?.id || null;
      await req.db.execute(
        `INSERT INTO students (id, display_name, email, term_id)
         VALUES ($1, $2, $3, $4)`,
        [studentId, name, email, termId]
      );

      // Auto-complete the accepted step for new students
      const acceptedStep = await req.db.queryOne<{ id: number }>(
        `SELECT id FROM steps
         WHERE term_id = $1 AND step_key = 'accepted'
         ORDER BY id LIMIT 1`,
        [termId]
      );

      if (acceptedStep?.id) {
        await req.db.execute(
          `INSERT INTO student_progress (student_id, step_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [studentId, acceptedStep.id]
        );
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
  } catch (err) { next(err); }
});

// POST /api/auth/sso - Azure AD SSO login
router.post('/sso', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!process.env.AZURE_AD_CLIENT_ID || !process.env.AZURE_AD_TENANT_ID) {
      return res.status(501).json({ error: 'Azure AD SSO is not configured' });
    }

    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    let claims: { oid: string; email: string | undefined; name: string | undefined };
    try {
      claims = await verifyAzureAdToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { oid, email: claimsEmail, name: claimsName } = claims;
    const email = claimsEmail || '';
    const name = claimsName || '';

    // Find existing student by azure_id
    let student = await req.db.queryOne<{ id: string; display_name: string; email: string }>(
      'SELECT id, display_name, email FROM students WHERE azure_id = $1',
      [oid]
    );

    if (student) {
      // Update name/email from latest claims
      await req.db.execute(
        'UPDATE students SET display_name = $1, email = $2 WHERE id = $3',
        [name, email, student.id]
      );
      student.display_name = name;
      student.email = email;
    } else {
      // Create new student
      const studentId = uuidv4();
      const activeTerm = await req.db.queryOne<{ id: number }>(
        'SELECT id FROM terms WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
      );
      const termId = activeTerm?.id || null;

      await req.db.execute(
        `INSERT INTO students (id, display_name, email, azure_id, term_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [studentId, name, email, oid, termId]
      );

      // Auto-complete the accepted step
      const acceptedStep = await req.db.queryOne<{ id: number }>(
        `SELECT id FROM steps
         WHERE term_id = $1 AND step_key = 'accepted'
         ORDER BY id LIMIT 1`,
        [termId]
      );
      if (acceptedStep?.id) {
        await req.db.execute(
          `INSERT INTO student_progress (student_id, step_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [studentId, acceptedStep.id]
        );
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
  } catch (err) { next(err); }
});

// GET /api/auth/me - Get current session info
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await req.db.queryOne<{ id: string; display_name: string; email: string; created_at: string }>(
      'SELECT id, display_name, email, created_at FROM students WHERE id = $1',
      [req.studentId]
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({
      id: student.id,
      displayName: student.display_name,
      email: student.email,
      createdAt: student.created_at,
    });
  } catch (err) { next(err); }
});

export default router;
