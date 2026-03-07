/**
 * Authentication middleware.
 * Currently uses simple token-based auth (student ID as token).
 * Will be upgraded to Azure AD JWT validation in production.
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);

  if (!token || token.length < 10) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Verify student exists in database
  const student = req.db.prepare('SELECT id FROM students WHERE id = ?').get(token);

  if (!student) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  // Attach student ID to request for downstream use
  req.studentId = token;
  next();
}
