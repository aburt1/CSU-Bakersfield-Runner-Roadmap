import type { Request, Response, NextFunction } from 'express';
import type { AdminRole } from '../types/models.js';

/**
 * Role-based access control middleware factory.
 * Usage: requireRole('editor', 'superadmin')
 */
export function requireRole(...allowedRoles: AdminRole[]): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.adminUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.adminUser.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
