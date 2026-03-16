import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-secure-random-string';

/**
 * Authentication middleware.
 * Validates JWT tokens issued after Azure AD login.
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.studentId = payload.studentId;
    req.studentEmail = payload.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Sign a JWT for a student session.
 */
export function signToken(studentId, email) {
  return jwt.sign({ studentId, email }, JWT_SECRET, { expiresIn: '8h' });
}
