import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AdminRole } from '../types/models.js';

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Server cannot start.');
  process.exit(1);
}
const JWT_SECRET: string = process.env.JWT_SECRET;

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
      const payload = jwt.verify(token, JWT_SECRET) as AdminJwtPayload & { type?: string };
      if (payload.type === 'admin' && payload.adminId) {
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
  if (apiKey && process.env.ADMIN_API_KEY) {
    const key = crypto.randomBytes(32);
    const hmacA = crypto.createHmac('sha256', key).update(String(apiKey)).digest();
    const hmacB = crypto.createHmac('sha256', key).update(process.env.ADMIN_API_KEY).digest();
    if (!crypto.timingSafeEqual(hmacA, hmacB)) {
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
