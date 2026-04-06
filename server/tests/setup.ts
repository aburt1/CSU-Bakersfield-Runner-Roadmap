import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import type { Db } from '../types/db.js';
import type { AdminRole } from '../types/models.js';
import { initDatabase } from '../db/init.js';
import { zodErrorHandler } from '../middleware/zodError.js';
import stepsRouter from '../routes/steps.js';
import authRouter from '../routes/auth.js';
import adminRouter from '../routes/admin/index.js';
import adminAuthRouter from '../routes/adminAuth.js';

// ─── Environment ────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-for-vitest-do-not-use-in-prod';
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

const JWT_SECRET = process.env.JWT_SECRET;

// ─── Database ───────────────────────────────────────────
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/csub_admissions';
let pool: pg.Pool;
let txClient: pg.PoolClient;

/** The transactional Db used by all routes during tests. */
export let testDb: Db;

function makeDb(queryFn: { query(sql: string, params?: unknown[]): Promise<pg.QueryResult> }): Db {
  return {
    async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
      const { rows } = await queryFn.query(sql, params);
      return (rows[0] as T) || null;
    },
    async queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const { rows } = await queryFn.query(sql, params);
      return rows as T[];
    },
    async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number | null; rows: unknown[] }> {
      const result = await queryFn.query(sql, params);
      return { rowCount: result.rowCount, rows: result.rows };
    },
    async transaction<T>(fn: (txDb: Db) => Promise<T>): Promise<T> {
      // Nested transaction via savepoint
      const savepointName = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await queryFn.query(`SAVEPOINT ${savepointName}`);
      try {
        const nestedDb = makeDb(queryFn);
        const result = await fn(nestedDb);
        await queryFn.query(`RELEASE SAVEPOINT ${savepointName}`);
        return result;
      } catch (err) {
        await queryFn.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        throw err;
      }
    },
    async end(): Promise<void> {
      // no-op in test context
    },
  };
}

// ─── Express App ────────────────────────────────────────
export let app: express.Express;

function createTestApp(): express.Express {
  const testApp = express();
  testApp.use(express.json());

  // Inject the transactional DB into every request
  testApp.use((req: Request, _res: Response, next: NextFunction) => {
    req.db = testDb;
    next();
  });

  testApp.use('/api/auth', authRouter);
  testApp.use('/api/steps', stepsRouter);
  testApp.use('/api/admin/auth', adminAuthRouter);
  testApp.use('/api/admin', adminRouter);

  testApp.use(zodErrorHandler);
  testApp.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as { type?: string; status?: number; message?: string };
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    console.error('[test-error]', err);
    res.status(error.status || 500).json({ error: 'Internal server error' });
  });

  return testApp;
}

// ─── Auth Helpers ───────────────────────────────────────
export function adminToken(role: AdminRole = 'sysadmin', overrides: Partial<{ adminId: number; email: string; displayName: string }> = {}): string {
  return jwt.sign(
    {
      type: 'admin',
      adminId: overrides.adminId ?? 1,
      role,
      email: overrides.email ?? 'test@csub.edu',
      displayName: overrides.displayName ?? 'Test Admin',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

export function studentToken(studentId: string, email: string = 'student@csub.edu'): string {
  return jwt.sign(
    { type: 'student', studentId, email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// ─── Lifecycle ──────────────────────────────────────────
beforeAll(async () => {
  pool = new pg.Pool({ connectionString });
  // Run schema init using the main pool (outside transaction)
  await initDatabase();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  txClient = await pool.connect();
  await txClient.query('BEGIN');
  testDb = makeDb(txClient);
  app = createTestApp();
});

afterEach(async () => {
  // Roll back the per-test transaction
  if (txClient) {
    await txClient.query('ROLLBACK');
    txClient.release();
  }
});
