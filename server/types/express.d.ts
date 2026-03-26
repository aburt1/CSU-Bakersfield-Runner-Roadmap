import type { Db } from './db.js';
import type { AdminRole } from './models.js';

declare global {
  namespace Express {
    interface Request {
      db: Db;
      studentId?: string;
      studentEmail?: string;
      adminUser?: {
        id: number;
        role: AdminRole;
        email: string;
        displayName: string;
      };
      integrationClient?: {
        id: number;
        name: string;
      };
      studentUser?: {
        displayName: string;
        email: string;
      };
    }
  }
}
