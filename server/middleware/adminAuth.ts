import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { AdminRole } from '../types/models.js';

const JWT_SECRET: string = process.env.JWT_SECRET || 'change-this-to-a-secure-random-string';

interface AdminJwtPayload {
  adminId: number;
  role: AdminRole;
  email: string;
  displayName: string;
}

/**
 * Admin authentication middleware.
 * Supports JWT Bearer tokens (primary) and legacy API key (backward compat).
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  // Try JWT Bearer token first
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as AdminJwtPayload;
      if (payload.adminId) {
        req.adminUser = {
          id: payload.adminId,
          role: payload.role,
          email: payload.email,
          displayName: payload.displayName,
        };
        return next();
      }
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  }

  // Fallback: legacy API key (treated as superadmin)
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    if (apiKey !== process.env.ADMIN_API_KEY) {
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }
    req.adminUser = {
      id: 0,
      role: 'sysadmin',
      email: 'api-key',
      displayName: 'API Key Admin',
    };
    return next();
  }

  res.status(401).json({ error: 'Authentication required' });
  return;
}
