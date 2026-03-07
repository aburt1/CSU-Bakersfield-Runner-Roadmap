import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/guest - Create a guest session
// This will be replaced with Azure AD login in production
router.post('/guest', (req, res) => {
  const studentId = uuidv4();

  req.db.prepare(`
    INSERT INTO students (id, display_name)
    VALUES (?, ?)
  `).run(studentId, 'Guest Runner');

  // In production, this would be a proper JWT signed with Azure AD
  // For now, the student ID serves as a simple session token
  res.json({
    token: studentId,
    student: {
      id: studentId,
      displayName: 'Guest Runner',
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

// POST /api/auth/azure - Azure AD login placeholder
router.post('/azure', (req, res) => {
  // TODO: Implement Azure AD authentication
  // 1. Validate the Azure AD token from the request
  // 2. Extract user info (email, name, oid)
  // 3. Create or update student record
  // 4. Return session token
  res.status(501).json({
    error: 'Azure AD authentication not yet implemented',
    message: 'Coming soon! For now, use /api/auth/guest',
  });
});

export default router;
