import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET: string = process.env.JWT_SECRET || 'change-this-to-a-secure-random-string';

/**
 * Authentication middleware.
 * Validates JWT tokens issued after Azure AD login.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { studentId: string; email: string };
    req.studentId = payload.studentId;
    req.studentEmail = payload.email;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
}

/**
 * Sign a JWT for a student session.
 */
export function signToken(studentId: string, email: string): string {
  return jwt.sign({ studentId, email }, JWT_SECRET, { expiresIn: '8h' });
}
