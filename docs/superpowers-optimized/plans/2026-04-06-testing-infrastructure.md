# Testing Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-optimized:subagent-driven-development (recommended) or superpowers-optimized:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vitest-based integration, unit, and component tests to catch SQL parameter mismatches and edge cases across all routes.
**Architecture:** Server integration tests use supertest against the Express app with a real PostgreSQL database. Each test runs inside a transaction that rolls back via `afterEach`. Unit tests cover pure utility functions. Client tests use `@testing-library/react` with mocked fetch.
**Tech Stack:** Vitest, supertest, @testing-library/react, jsdom, PostgreSQL (existing dev DB)
**Assumptions:**
- Dev PostgreSQL is running locally (via docker-compose or native) — tests will fail without it
- `JWT_SECRET` env var is set — tests use it to mint real tokens
- Seed data from `initDatabase()` exists (default admin user, terms, steps, students) — tests rely on it for integration queries

---

## File Structure

```
server/
  vitest.config.ts              — Server Vitest config (ESM, sequential for integration)
  tests/
    setup.ts                    — DB connection, transaction wrapper, JWT helpers, app factory
    integration/
      admin-analytics.test.ts   — All analytics + filter builder edge cases (~25 tests)
      admin-steps.test.ts       — Step CRUD, reorder, duplicate (~15 tests)
      admin-students.test.ts    — Student progress, tags, profile, list, audit (~18 tests)
      admin-terms.test.ts       — Term CRUD, clone, delete (~12 tests)
      admin-users.test.ts       — Admin user CRUD, role guards (~8 tests)
      auth.test.ts              — Admin login, student login, /me endpoints (~10 tests)
    unit/
      paramBuilder.test.ts      — Counter logic, custom start
      queryHelpers.test.ts      — parseTermId, parsePagination
      progress.test.ts          — normalizeCompletedAt, normalizeStudentIdNumber
      studentTags.test.ts       — Manual, derived, merged tags
      json.test.ts              — safeJsonParse
client/
  vitest.config.ts              — Client Vitest config (jsdom environment)
  src/__tests__/
    setup.ts                    — Global mocks (fetch, router)
    AdminLogin.test.tsx         — Login form rendering and submission
    TimelineStep.test.tsx       — Step rendering in different states
```

---

### Task 1: Install Dependencies & Configure Vitest

**Files:**
- Modify: `server/package.json`
- Modify: `client/package.json`
- Modify: `package.json` (root)
- Create: `server/vitest.config.ts`
- Create: `client/vitest.config.ts`

- [ ] **Step 1: Install server test dependencies**

```bash
cd server && npm install --save-dev vitest supertest @types/supertest
```

- [ ] **Step 2: Install client test dependencies**

```bash
cd client && npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @types/dompurify
```

- [ ] **Step 3: Create server/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 15000,
    hookTimeout: 30000,
    setupFiles: ['tests/setup.ts'],
  },
});
```

- [ ] **Step 4: Create client/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.tsx'],
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
```

- [ ] **Step 5: Add test scripts to all three package.json files**

Add to `server/package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:integration": "vitest run tests/integration",
"test:unit": "vitest run tests/unit"
```

Add to `client/package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Add to root `package.json` scripts:
```json
"test": "cd server && npm test && cd ../client && npm test",
"test:server": "cd server && npm test",
"test:client": "cd client && npm test"
```

- [ ] **Step 6: Verify config loads**

Run: `cd server && npx vitest run --passWithNoTests`
Expected: PASS (0 test files)

Run: `cd client && npx vitest run --passWithNoTests`
Expected: PASS (0 test files)

---

### Task 2: Create Server Test Setup (DB, Auth, App Factory)

**Files:**
- Create: `server/tests/setup.ts`

- [ ] **Step 1: Create server/tests/setup.ts**

```typescript
import { beforeAll, afterAll, afterEach } from 'vitest';
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
  // Run schema init using the pool (outside transaction)
  const initDb = makeDb(pool);
  // Temporarily set up the db so initDatabase can work
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  await initDatabase();
  process.env.NODE_ENV = originalEnv;
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  // Roll back the per-test transaction
  if (txClient) {
    await txClient.query('ROLLBACK');
    txClient.release();
  }
});

// Before each test: start a transaction
import { beforeEach } from 'vitest';

beforeEach(async () => {
  txClient = await pool.connect();
  await txClient.query('BEGIN');
  testDb = makeDb(txClient);
  app = createTestApp();
});
```

- [ ] **Step 2: Verify setup loads**

Run: `cd server && npx vitest run --passWithNoTests`
Expected: PASS (setup file loads without error)

---

### Task 3: Server Unit Tests

**Files:**
- Create: `server/tests/unit/paramBuilder.test.ts`
- Create: `server/tests/unit/queryHelpers.test.ts`
- Create: `server/tests/unit/progress.test.ts`
- Create: `server/tests/unit/studentTags.test.ts`
- Create: `server/tests/unit/json.test.ts`

- [ ] **Step 1: Create server/tests/unit/json.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../../utils/json.js';

describe('safeJsonParse', () => {
  it('parses valid JSON string', () => {
    expect(safeJsonParse('["a","b"]', [])).toEqual(['a', 'b']);
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not-json', [])).toEqual([]);
  });

  it('returns fallback for null', () => {
    expect(safeJsonParse(null, 'default')).toBe('default');
  });

  it('returns fallback for undefined', () => {
    expect(safeJsonParse(undefined, 42)).toBe(42);
  });

  it('returns non-string values directly', () => {
    const obj = { a: 1 };
    expect(safeJsonParse(obj, {})).toBe(obj);
  });
});
```

- [ ] **Step 2: Create server/tests/unit/paramBuilder.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { paramBuilder } from '../../db/pool.js';

describe('paramBuilder', () => {
  it('generates sequential $1, $2, $3 placeholders', () => {
    const p = paramBuilder();
    expect(p.next()).toBe('$1');
    expect(p.next()).toBe('$2');
    expect(p.next()).toBe('$3');
  });

  it('starts from custom offset', () => {
    const p = paramBuilder(5);
    expect(p.next()).toBe('$6');
    expect(p.next()).toBe('$7');
  });

  it('tracks count correctly', () => {
    const p = paramBuilder();
    expect(p.count).toBe(0);
    p.next();
    expect(p.count).toBe(1);
    p.next();
    expect(p.count).toBe(2);
  });

  it('independent builders do not interfere', () => {
    const a = paramBuilder();
    const b = paramBuilder();
    a.next(); a.next();
    expect(b.next()).toBe('$1');
    expect(a.next()).toBe('$3');
  });
});
```

- [ ] **Step 3: Create server/tests/unit/queryHelpers.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { parseTermId, parsePagination } from '../../utils/queryHelpers.js';

function fakeReq(query: Record<string, string> = {}): any {
  return { query };
}

describe('parseTermId', () => {
  it('returns number for valid term_id', () => {
    expect(parseTermId(fakeReq({ term_id: '5' }))).toBe(5);
  });

  it('returns null when term_id is missing', () => {
    expect(parseTermId(fakeReq())).toBeNull();
  });

  it('returns NaN for non-numeric (caller should handle)', () => {
    const result = parseTermId(fakeReq({ term_id: 'abc' }));
    expect(Number.isNaN(result)).toBe(true);
  });
});

describe('parsePagination', () => {
  it('returns defaults when no query params', () => {
    const { page, perPage, offset } = parsePagination(fakeReq());
    expect(page).toBe(1);
    expect(perPage).toBe(25);
    expect(offset).toBe(0);
  });

  it('respects custom defaults', () => {
    const { perPage } = parsePagination(fakeReq(), { perPage: 50 });
    expect(perPage).toBe(50);
  });

  it('calculates offset correctly', () => {
    const { page, perPage, offset } = parsePagination(fakeReq({ page: '3', per_page: '10' }));
    expect(page).toBe(3);
    expect(perPage).toBe(10);
    expect(offset).toBe(20);
  });

  it('caps perPage at 100', () => {
    const { perPage } = parsePagination(fakeReq({ per_page: '999' }));
    expect(perPage).toBe(100);
  });

  it('floors page at 1', () => {
    const { page } = parsePagination(fakeReq({ page: '-5' }));
    expect(page).toBe(1);
  });

  it('floors perPage at 1', () => {
    const { perPage } = parsePagination(fakeReq({ per_page: '0' }));
    expect(perPage).toBe(1);
  });
});
```

- [ ] **Step 4: Create server/tests/unit/studentTags.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { getManualTags, getDerivedTags, getMergedTags } from '../../utils/studentTags.js';

describe('getManualTags', () => {
  it('parses JSON tags string', () => {
    expect(getManualTags({ tags: '["honors","eop"]' })).toEqual(['honors', 'eop']);
  });

  it('returns empty array for null tags', () => {
    expect(getManualTags({ tags: null })).toEqual([]);
  });

  it('returns empty array for null student', () => {
    expect(getManualTags(null)).toEqual([]);
  });
});

describe('getDerivedTags', () => {
  it('derives transfer from applicant_type', () => {
    expect(getDerivedTags({ applicant_type: 'Transfer Student' })).toContain('transfer');
  });

  it('derives freshman from applicant_type', () => {
    expect(getDerivedTags({ applicant_type: 'Freshman' })).toContain('freshman');
  });

  it('derives out-of-state from residency', () => {
    expect(getDerivedTags({ residency: 'Out-of-State' })).toContain('out-of-state');
  });

  it('derives major tag with slugified value', () => {
    const tags = getDerivedTags({ major: 'Computer Science' });
    expect(tags).toContain('major:computer-science');
  });

  it('returns empty array for null student', () => {
    expect(getDerivedTags(null)).toEqual([]);
  });

  it('returns empty array for empty fields', () => {
    expect(getDerivedTags({ applicant_type: '', residency: '', major: '' })).toEqual([]);
  });
});

describe('getMergedTags', () => {
  it('merges manual and derived tags without duplicates', () => {
    const tags = getMergedTags({
      tags: '["transfer","honors"]',
      applicant_type: 'Transfer Student',
    });
    expect(tags).toContain('transfer');
    expect(tags).toContain('honors');
    // 'transfer' should appear only once
    expect(tags.filter(t => t === 'transfer')).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Create server/tests/unit/progress.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeStudentIdNumber, normalizeCompletedAt } from '../../utils/progress.js';

describe('normalizeStudentIdNumber', () => {
  it('trims whitespace', () => {
    expect(normalizeStudentIdNumber('  12345  ')).toBe('12345');
  });

  it('converts numbers to string', () => {
    expect(normalizeStudentIdNumber(12345)).toBe('12345');
  });

  it('returns empty string for null', () => {
    expect(normalizeStudentIdNumber(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeStudentIdNumber(undefined)).toBe('');
  });
});

describe('normalizeCompletedAt', () => {
  it('returns ISO string for valid date string', () => {
    const result = normalizeCompletedAt('2026-01-15T10:30:00Z');
    expect(result).toBe('2026-01-15T10:30:00.000Z');
  });

  it('returns null for null input', () => {
    expect(normalizeCompletedAt(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeCompletedAt('')).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(normalizeCompletedAt('not-a-date')).toBeNull();
  });

  it('handles numeric timestamps', () => {
    const ts = Date.now();
    const result = normalizeCompletedAt(ts);
    expect(result).toBe(new Date(ts).toISOString());
  });
});
```

- [ ] **Step 6: Run unit tests**

Run: `cd server && npx vitest run tests/unit`
Expected: All tests PASS

---

### Task 4: Auth Integration Tests

**Files:**
- Create: `server/tests/integration/auth.test.ts`

- [ ] **Step 1: Create server/tests/integration/auth.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken, studentToken } from '../setup.js';

describe('Admin Auth', () => {
  describe('POST /api/admin/auth/login', () => {
    it('returns 400 for missing credentials', async () => {
      const res = await request(app).post('/api/admin/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email.*password/i);
    });

    it('returns 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@csub.edu', password: 'wrong-password-here' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/admin/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns admin info with valid token', async () => {
      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });
  });

  describe('POST /api/admin/auth/change-password', () => {
    it('returns 400 if newPassword is too short', async () => {
      const res = await request(app)
        .post('/api/admin/auth/change-password')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ currentPassword: 'anything', newPassword: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/12 characters/);
    });
  });
});

describe('Student Auth', () => {
  describe('POST /api/auth/dev-login', () => {
    it('returns 400 for missing fields', async () => {
      const res = await request(app).post('/api/auth/dev-login').send({});
      expect(res.status).toBe(400);
    });

    it('creates student and returns token', async () => {
      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ name: 'Test Student', email: 'teststudent-unique@csub.edu' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.student.email).toBe('teststudent-unique@csub.edu');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
```

- [ ] **Step 2: Run auth tests**

Run: `cd server && npx vitest run tests/integration/auth.test.ts`
Expected: All tests PASS

---

### Task 5: Admin Steps Integration Tests

**Files:**
- Create: `server/tests/integration/admin-steps.test.ts`

- [ ] **Step 1: Create server/tests/integration/admin-steps.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken } from '../setup.js';

const sysadminAuth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });
const viewerAuth = () => ({ Authorization: `Bearer ${adminToken('viewer')}` });

// Helper: get or create a term for step tests
async function ensureTerm(): Promise<number> {
  const existing = await testDb.queryOne<{ id: number }>('SELECT id FROM terms ORDER BY id LIMIT 1');
  if (existing) return existing.id;
  const result = await testDb.execute(
    "INSERT INTO terms (name, is_active) VALUES ('Test Term', 1) RETURNING id",
    []
  );
  return (result.rows[0] as { id: number }).id;
}

describe('Admin Steps', () => {
  describe('GET /api/admin/steps', () => {
    it('returns steps list with auth', async () => {
      const res = await request(app).get('/api/admin/steps').set(sysadminAuth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('filters by term_id', async () => {
      const termId = await ensureTerm();
      const res = await request(app)
        .get(`/api/admin/steps?term_id=${termId}`)
        .set(sysadminAuth());
      expect(res.status).toBe(200);
      for (const step of res.body) {
        expect(step.term_id).toBe(termId);
      }
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/admin/steps');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/admin/steps', () => {
    it('creates a step with valid data', async () => {
      const termId = await ensureTerm();
      const res = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ title: 'Test Step', term_id: termId });
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 without title', async () => {
      const termId = await ensureTerm();
      const res = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ term_id: termId });
      expect(res.status).toBe(400);
    });

    it('returns 400 without term_id', async () => {
      const res = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ title: 'No Term' });
      expect(res.status).toBe(400);
    });

    it('returns 403 for viewer role', async () => {
      const termId = await ensureTerm();
      const res = await request(app)
        .post('/api/admin/steps')
        .set(viewerAuth())
        .send({ title: 'Viewer Step', term_id: termId });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/admin/steps/:id', () => {
    it('updates step title', async () => {
      const termId = await ensureTerm();
      const createRes = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ title: 'Original', term_id: termId });
      const stepId = createRes.body.id;

      const res = await request(app)
        .put(`/api/admin/steps/${stepId}`)
        .set(sysadminAuth())
        .send({ title: 'Updated' });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent step', async () => {
      const res = await request(app)
        .put('/api/admin/steps/999999')
        .set(sysadminAuth())
        .send({ title: 'Ghost' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/steps/:id', () => {
    it('deletes a step', async () => {
      const termId = await ensureTerm();
      const createRes = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ title: 'To Delete', term_id: termId });

      const res = await request(app)
        .delete(`/api/admin/steps/${createRes.body.id}`)
        .set(sysadminAuth());
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent step', async () => {
      const res = await request(app)
        .delete('/api/admin/steps/999999')
        .set(sysadminAuth());
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run steps tests**

Run: `cd server && npx vitest run tests/integration/admin-steps.test.ts`
Expected: All tests PASS

---

### Task 6: Admin Terms Integration Tests

**Files:**
- Create: `server/tests/integration/admin-terms.test.ts`

- [ ] **Step 1: Create server/tests/integration/admin-terms.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken } from '../setup.js';

const auth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });
const viewerAuth = () => ({ Authorization: `Bearer ${adminToken('viewer')}` });

describe('Admin Terms', () => {
  describe('GET /api/admin/terms', () => {
    it('returns terms with step and student counts', async () => {
      const res = await request(app).get('/api/admin/terms').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(typeof res.body[0].step_count).toBe('number');
        expect(typeof res.body[0].student_count).toBe('number');
      }
    });
  });

  describe('POST /api/admin/terms', () => {
    it('creates a term', async () => {
      const res = await request(app)
        .post('/api/admin/terms')
        .set(auth())
        .send({ name: 'Test Term 2099' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 without name', async () => {
      const res = await request(app)
        .post('/api/admin/terms')
        .set(auth())
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 403 for viewer role', async () => {
      const res = await request(app)
        .post('/api/admin/terms')
        .set(viewerAuth())
        .send({ name: 'Viewer Term' });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/admin/terms/:id', () => {
    it('updates term name', async () => {
      const createRes = await request(app)
        .post('/api/admin/terms').set(auth())
        .send({ name: 'Before' });
      const termId = createRes.body.id;

      const res = await request(app)
        .put(`/api/admin/terms/${termId}`)
        .set(auth())
        .send({ name: 'After' });
      expect(res.status).toBe(200);
    });

    it('activates term and deactivates others (transaction)', async () => {
      const createRes = await request(app)
        .post('/api/admin/terms').set(auth())
        .send({ name: 'Activate Me' });
      const termId = createRes.body.id;

      const res = await request(app)
        .put(`/api/admin/terms/${termId}`)
        .set(auth())
        .send({ is_active: true });
      expect(res.status).toBe(200);

      // Verify only this term is active
      const terms = await testDb.queryAll<{ id: number; is_active: number }>('SELECT id, is_active FROM terms');
      const activeTerms = terms.filter(t => t.is_active === 1);
      expect(activeTerms).toHaveLength(1);
      expect(activeTerms[0]!.id).toBe(termId);
    });

    it('returns 404 for non-existent term', async () => {
      const res = await request(app)
        .put('/api/admin/terms/999999')
        .set(auth())
        .send({ name: 'Ghost' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/terms/:id/clone', () => {
    it('clones a term with selected steps', async () => {
      // Find a term with steps
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms ORDER BY id LIMIT 1');
      if (!term) return; // skip if no terms in dev DB

      const steps = await testDb.queryAll<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 LIMIT 3', [term.id]);
      if (steps.length === 0) return;

      const res = await request(app)
        .post(`/api/admin/terms/${term.id}/clone`)
        .set(auth())
        .send({
          name: 'Cloned Term',
          step_ids: steps.map(s => s.id),
        });
      expect(res.status).toBe(200);
      expect(res.body.term).toBeDefined();
      expect(res.body.steps.length).toBe(steps.length);
    });

    it('returns 400 for empty step_ids', async () => {
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms ORDER BY id LIMIT 1');
      if (!term) return;

      const res = await request(app)
        .post(`/api/admin/terms/${term.id}/clone`)
        .set(auth())
        .send({ name: 'Clone', step_ids: [] });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing name', async () => {
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms ORDER BY id LIMIT 1');
      if (!term) return;

      const res = await request(app)
        .post(`/api/admin/terms/${term.id}/clone`)
        .set(auth())
        .send({ step_ids: [1] });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/admin/terms/:id', () => {
    it('deletes term with no students', async () => {
      const createRes = await request(app)
        .post('/api/admin/terms').set(auth())
        .send({ name: 'Delete Me' });

      const res = await request(app)
        .delete(`/api/admin/terms/${createRes.body.id}`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('returns 409 for term with students', async () => {
      // Find a term that has students
      const termWithStudents = await testDb.queryOne<{ term_id: number }>(
        'SELECT term_id FROM students WHERE term_id IS NOT NULL LIMIT 1'
      );
      if (!termWithStudents) return;

      const res = await request(app)
        .delete(`/api/admin/terms/${termWithStudents.term_id}`)
        .set(auth());
      expect(res.status).toBe(409);
    });
  });
});
```

- [ ] **Step 2: Run terms tests**

Run: `cd server && npx vitest run tests/integration/admin-terms.test.ts`
Expected: All tests PASS

---

### Task 7: Admin Users Integration Tests

**Files:**
- Create: `server/tests/integration/admin-users.test.ts`

- [ ] **Step 1: Create server/tests/integration/admin-users.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, adminToken } from '../setup.js';

const auth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });
const editorAuth = () => ({ Authorization: `Bearer ${adminToken('admissions_editor')}` });

describe('Admin Users', () => {
  describe('GET /api/admin/users', () => {
    it('returns user list for sysadmin', async () => {
      const res = await request(app).get('/api/admin/users').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        // Should not include password_hash
        expect(res.body[0].password_hash).toBeUndefined();
      }
    });

    it('returns 403 for non-sysadmin', async () => {
      const res = await request(app).get('/api/admin/users').set(editorAuth());
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/admin/users', () => {
    it('creates a new admin user', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'newuser-test@csub.edu', displayName: 'New User', role: 'viewer' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
    });

    it('returns 409 for duplicate email', async () => {
      await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'dup-test@csub.edu', displayName: 'Dup 1' });

      const res = await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'dup-test@csub.edu', displayName: 'Dup 2' });
      expect(res.status).toBe(409);
    });

    it('returns 400 for invalid role', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'bad-role@csub.edu', displayName: 'Bad', role: 'superuser' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'no-name@csub.edu' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/admin/users/:id', () => {
    it('updates user role', async () => {
      const createRes = await request(app)
        .post('/api/admin/users').set(auth())
        .send({ email: 'update-role@csub.edu', displayName: 'Role Test', role: 'viewer' });

      const res = await request(app)
        .put(`/api/admin/users/${createRes.body.id}`)
        .set(auth())
        .send({ role: 'admissions' });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app)
        .put('/api/admin/users/999999')
        .set(auth())
        .send({ role: 'viewer' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for empty update', async () => {
      const createRes = await request(app)
        .post('/api/admin/users').set(auth())
        .send({ email: 'empty-update@csub.edu', displayName: 'Empty' });

      const res = await request(app)
        .put(`/api/admin/users/${createRes.body.id}`)
        .set(auth())
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Run users tests**

Run: `cd server && npx vitest run tests/integration/admin-users.test.ts`
Expected: All tests PASS

---

### Task 8: Admin Students Integration Tests

**Files:**
- Create: `server/tests/integration/admin-students.test.ts`

- [ ] **Step 1: Create server/tests/integration/admin-students.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken } from '../setup.js';

const auth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });
const viewerAuth = () => ({ Authorization: `Bearer ${adminToken('viewer')}` });

// Helper: get a student and step that exist in the DB
async function getStudentAndStep(): Promise<{ studentId: string; stepId: number } | null> {
  const student = await testDb.queryOne<{ id: string; term_id: number }>('SELECT id, term_id FROM students WHERE term_id IS NOT NULL LIMIT 1');
  if (!student) return null;
  const step = await testDb.queryOne<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 AND is_active = 1 LIMIT 1', [student.term_id]);
  if (!step) return null;
  return { studentId: student.id, stepId: step.id };
}

describe('Admin Students', () => {
  describe('GET /api/admin/students', () => {
    it('returns paginated student list', async () => {
      const res = await request(app).get('/api/admin/students').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.students).toBeDefined();
      expect(typeof res.body.total).toBe('number');
      expect(typeof res.body.page).toBe('number');
    });

    it('supports search parameter', async () => {
      const res = await request(app)
        .get('/api/admin/students?search=nonexistent-query-xyz')
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.students).toEqual([]);
    });

    it('supports all sort options without SQL errors', async () => {
      const sorts = ['date_desc', 'date_asc', 'name_asc', 'name_desc', 'progress_asc', 'progress_desc'];
      for (const sort of sorts) {
        const res = await request(app)
          .get(`/api/admin/students?sort=${sort}`)
          .set(auth());
        expect(res.status).toBe(200);
      }
    });

    it('supports combined filters (search + term_id + overdue_only)', async () => {
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms LIMIT 1');
      if (!term) return;

      const res = await request(app)
        .get(`/api/admin/students?search=test&term_id=${term.id}&overdue_only=1`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('handles invalid sort gracefully (falls back to default)', async () => {
      const res = await request(app)
        .get('/api/admin/students?sort=invalid_sort')
        .set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/admin/students/:studentId/steps/:stepId/complete', () => {
    it('marks step as completed', async () => {
      const data = await getStudentAndStep();
      if (!data) return;

      const res = await request(app)
        .post(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(auth())
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('marks step as waived', async () => {
      const data = await getStudentAndStep();
      if (!data) return;

      const res = await request(app)
        .post(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(auth())
        .send({ status: 'waived' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('waived');
    });

    it('returns 403 for viewer role', async () => {
      const data = await getStudentAndStep();
      if (!data) return;

      const res = await request(app)
        .post(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(viewerAuth())
        .send({});
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent student', async () => {
      const res = await request(app)
        .post('/api/admin/students/nonexistent-id/steps/1/complete')
        .set(auth())
        .send({});
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/students/:studentId/steps/:stepId/complete', () => {
    it('uncompletes a step', async () => {
      const data = await getStudentAndStep();
      if (!data) return;

      // Complete first
      await request(app)
        .post(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(auth()).send({});

      // Then uncomplete
      const res = await request(app)
        .delete(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/students/:studentId/progress', () => {
    it('returns student with progress and tags', async () => {
      const student = await testDb.queryOne<{ id: string }>('SELECT id FROM students LIMIT 1');
      if (!student) return;

      const res = await request(app)
        .get(`/api/admin/students/${student.id}/progress`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.student).toBeDefined();
      expect(Array.isArray(res.body.progress)).toBe(true);
      expect(Array.isArray(res.body.manualTags)).toBe(true);
      expect(Array.isArray(res.body.derivedTags)).toBe(true);
      expect(Array.isArray(res.body.mergedTags)).toBe(true);
    });

    it('returns 404 for non-existent student', async () => {
      const res = await request(app)
        .get('/api/admin/students/nonexistent-id/progress')
        .set(auth());
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/admin/students/:studentId/tags', () => {
    it('updates student tags', async () => {
      const student = await testDb.queryOne<{ id: string }>('SELECT id FROM students LIMIT 1');
      if (!student) return;

      const res = await request(app)
        .put(`/api/admin/students/${student.id}/tags`)
        .set(auth())
        .send({ tags: ['honors', 'athlete'] });
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/admin/students/:studentId/profile', () => {
    it('updates student profile fields', async () => {
      const student = await testDb.queryOne<{ id: string }>('SELECT id FROM students LIMIT 1');
      if (!student) return;

      const res = await request(app)
        .put(`/api/admin/students/${student.id}/profile`)
        .set(auth())
        .send({ major: 'Computer Science', applicant_type: 'Freshman' });
      expect(res.status).toBe(200);
    });

    it('returns 400 for empty update', async () => {
      const student = await testDb.queryOne<{ id: string }>('SELECT id FROM students LIMIT 1');
      if (!student) return;

      const res = await request(app)
        .put(`/api/admin/students/${student.id}/profile`)
        .set(auth())
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/students/overdue', () => {
    it('returns overdue students list', async () => {
      const res = await request(app).get('/api/admin/students/overdue').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('filters by term_id', async () => {
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms LIMIT 1');
      if (!term) return;

      const res = await request(app)
        .get(`/api/admin/students/overdue?term_id=${term.id}`)
        .set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/audit', () => {
    it('returns audit log', async () => {
      const res = await request(app).get('/api/admin/audit').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
      expect(typeof res.body.total).toBe('number');
    });

    it('supports all filter combinations', async () => {
      const res = await request(app)
        .get('/api/admin/audit?entityType=student_progress&action=complete&q=test')
        .set(auth());
      expect(res.status).toBe(200);
    });
  });
});
```

- [ ] **Step 2: Run students tests**

Run: `cd server && npx vitest run tests/integration/admin-students.test.ts`
Expected: All tests PASS

---

### Task 9: Admin Analytics Integration Tests (High-Priority Edge Cases)

**Files:**
- Create: `server/tests/integration/admin-analytics.test.ts`

**Does NOT cover:** Client-side chart rendering, WebSocket/SSE subscriptions, Azure AD SSO token exchange.

- [ ] **Step 1: Create server/tests/integration/admin-analytics.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken } from '../setup.js';

const auth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });

async function getTermId(): Promise<number | null> {
  const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms WHERE is_active = 1 LIMIT 1');
  return term?.id ?? null;
}

describe('Admin Analytics', () => {
  // ─── Stats ──────────────────────────────────────────
  describe('GET /api/admin/stats', () => {
    it('returns stats without term_id', async () => {
      const res = await request(app).get('/api/admin/stats').set(auth());
      expect(res.status).toBe(200);
      expect(typeof res.body.totalStudents).toBe('number');
      expect(typeof res.body.totalActiveSteps).toBe('number');
      expect(typeof res.body.avgCompletionPercent).toBe('number');
    });

    it('returns stats with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/stats?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
      expect(typeof res.body.totalStudents).toBe('number');
    });
  });

  // ─── CSV Export ─────────────────────────────────────
  describe('GET /api/admin/export/progress', () => {
    it('returns CSV without term_id', async () => {
      const res = await request(app).get('/api/admin/export/progress').set(auth());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
    });

    it('returns CSV with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/export/progress?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
    });

    it('handles empty data (term with no students)', async () => {
      // Create empty term
      const termRes = await testDb.execute("INSERT INTO terms (name, is_active) VALUES ('Empty CSV Term', 0) RETURNING id");
      const emptyTermId = (termRes.rows[0] as { id: number }).id;

      const res = await request(app)
        .get(`/api/admin/export/progress?term_id=${emptyTermId}`)
        .set(auth());
      expect(res.status).toBe(200);
    });
  });

  // ─── Step Completion ────────────────────────────────
  describe('GET /api/admin/analytics/step-completion', () => {
    it('returns step completion without term_id', async () => {
      const res = await request(app).get('/api/admin/analytics/step-completion').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.steps).toBeDefined();
    });

    it('returns step completion with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/step-completion?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  // ─── Completion Trend ───────────────────────────────
  describe('GET /api/admin/analytics/completion-trend', () => {
    it('works without term_id (conditional $1/$2 swap)', async () => {
      const res = await request(app).get('/api/admin/analytics/completion-trend').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id (different param positions)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/completion-trend?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });

    it('accepts custom days parameter', async () => {
      const res = await request(app).get('/api/admin/analytics/completion-trend?days=7').set(auth());
      expect(res.status).toBe(200);
    });
  });

  // ─── Bottlenecks ────────────────────────────────────
  describe('GET /api/admin/analytics/bottlenecks', () => {
    it('returns bottlenecks without term_id', async () => {
      const res = await request(app).get('/api/admin/analytics/bottlenecks').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.steps).toBeDefined();
    });

    it('returns bottlenecks with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/bottlenecks?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  // ─── Cohort Summary ─────────────────────────────────
  describe('GET /api/admin/analytics/cohort-summary', () => {
    it('returns cohort buckets without term_id', async () => {
      const res = await request(app).get('/api/admin/analytics/cohort-summary').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns cohort buckets with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/cohort-summary?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  // ─── Deadline Risk ──────────────────────────────────
  describe('GET /api/admin/analytics/deadline-risk', () => {
    it('works without term_id (dynamic $N via push)', async () => {
      const res = await request(app).get('/api/admin/analytics/deadline-risk').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id (adds extra param via push)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/deadline-risk?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  // ─── Stalled Students ──────────────────────────────
  describe('GET /api/admin/analytics/stalled-students', () => {
    it('works without term_id', async () => {
      const res = await request(app).get('/api/admin/analytics/stalled-students').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id (dynamic param push)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/stalled-students?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });

    it('accepts custom days parameter', async () => {
      const res = await request(app).get('/api/admin/analytics/stalled-students?days=14').set(auth());
      expect(res.status).toBe(200);
    });
  });

  // ─── Cohort Comparison ──────────────────────────────
  describe('GET /api/admin/analytics/cohort-comparison', () => {
    it('returns tag-based comparison', async () => {
      const res = await request(app).get('/api/admin/analytics/cohort-comparison').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id (dynamic param push inside loop)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/cohort-comparison?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  // ─── Completion Velocity ────────────────────────────
  describe('GET /api/admin/analytics/completion-velocity', () => {
    it('returns velocity buckets', async () => {
      const res = await request(app).get('/api/admin/analytics/completion-velocity').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/completion-velocity?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  // ─── Analytics Students Drilldown (THE BUG CLASS) ──
  describe('GET /api/admin/analytics/students', () => {
    it('returns 400 without term_id', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/students?filter_type=step_completed&filter_value=1')
        .set(auth());
      expect(res.status).toBe(400);
    });

    it('returns 400 without filter_type', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid filter_type', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=invalid`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    // ─── step_completed filter ─────────────────────
    it('filter: step_completed', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const step = await testDb.queryOne<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 LIMIT 1', [termId]);
      if (!step) return;

      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=step_completed&filter_value=${step.id}`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.students).toBeDefined();
      expect(typeof res.body.total).toBe('number');
    });

    // ─── step_not_completed filter ─────────────────
    it('filter: step_not_completed', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const step = await testDb.queryOne<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 LIMIT 1', [termId]);
      if (!step) return;

      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=step_not_completed&filter_value=${step.id}`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    // ─── cohort_bucket filter — EVERY BUCKET VALUE ─
    it('filter: cohort_bucket 0% (was the original bug — different SQL branch)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=0%25`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.students).toBeDefined();
    });

    it('filter: cohort_bucket 1-25%', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=1-25%25`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: cohort_bucket 26-50%', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=26-50%25`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: cohort_bucket 51-75%', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=51-75%25`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: cohort_bucket 76-100%', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=76-100%25`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: cohort_bucket invalid value', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=invalid`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    // ─── tag filter ────────────────────────────────
    it('filter: tag', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=tag&filter_value=freshman`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    // ─── stalled filter — EVERY RANGE ──────────────
    it('filter: stalled 7-14 days', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=7-14 days`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: stalled 2-4 weeks', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=2-4 weeks`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: stalled 1-3 months', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=1-3 months`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: stalled 3+ months', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=3%2B months`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: stalled invalid value', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=invalid`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    // ─── deadline_risk filter ──────────────────────
    it('filter: deadline_risk', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const step = await testDb.queryOne<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 LIMIT 1', [termId]);
      if (!step) return;

      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=deadline_risk&filter_value=${step.id}`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    // ─── velocity_bucket filter — EVERY RANGE ─────
    it('filter: velocity_bucket 1-3 days', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=1-3 days`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket 4-7 days', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=4-7 days`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket 1-2 weeks', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=1-2 weeks`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket 2-4 weeks', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=2-4 weeks`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket 4+ weeks', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=4%2B weeks`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket invalid value', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=invalid`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    // ─── trend_date filter ─────────────────────────
    it('filter: trend_date', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=trend_date&filter_value=2026-01-15`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    // ─── pagination ────────────────────────────────
    it('supports pagination params', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=tag&filter_value=freshman&page=1&per_page=5`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.per_page).toBe(5);
    });
  });
});
```

- [ ] **Step 2: Run analytics tests**

Run: `cd server && npx vitest run tests/integration/admin-analytics.test.ts`
Expected: All tests PASS. This is the critical test — if the `0%` cohort_bucket test passes, the original bug class is covered.

---

### Task 10: Client Test Setup & Component Tests

**Files:**
- Create: `client/src/__tests__/setup.ts`
- Create: `client/src/__tests__/AdminLogin.test.tsx`
- Create: `client/src/__tests__/TimelineStep.test.tsx`

- [ ] **Step 1: Create client/src/__tests__/setup.ts**

```typescript
import '@testing-library/jest-dom/vitest';

// Mock fetch globally
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response)
);

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, prop) => {
      if (typeof prop === 'string') {
        return (props: Record<string, unknown>) => {
          const { children, ...rest } = props;
          // Filter out framer-specific props
          const htmlProps: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rest)) {
            if (!['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap', 'layout', 'layoutId'].includes(key)) {
              htmlProps[key] = value;
            }
          }
          const React = require('react');
          return React.createElement(prop, htmlProps, children);
        };
      }
      return undefined;
    },
  }),
  AnimatePresence: ({ children }: { children: unknown }) => children,
  useInView: () => true,
  useAnimation: () => ({ start: vi.fn(), set: vi.fn() }),
}));
```

- [ ] **Step 2: Create client/src/__tests__/AdminLogin.test.tsx**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminLogin from '../pages/admin/AdminLogin.jsx';

// Mock the MSAL config
vi.mock('../auth/msalConfig', () => ({
  isAzureAdConfigured: false,
  msalInstance: null,
  loginRequest: {},
}));

describe('AdminLogin', () => {
  const mockOnLogin = vi.fn();

  beforeEach(() => {
    mockOnLogin.mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
  });

  it('renders email/password form when Azure AD is not configured', () => {
    render(<AdminLogin onLogin={mockOnLogin} />);
    expect(screen.getByPlaceholderText('Email')).toBeDefined();
    expect(screen.getByPlaceholderText('Password')).toBeDefined();
    expect(screen.getByText('Sign In')).toBeDefined();
  });

  it('renders the Admin Portal heading', () => {
    render(<AdminLogin onLogin={mockOnLogin} />);
    expect(screen.getByText('Admin Portal')).toBeDefined();
  });

  it('shows error on failed login', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    });

    render(<AdminLogin onLogin={mockOnLogin} />);
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'admin@csub.edu' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeDefined();
    });
  });

  it('calls onLogin on successful login', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        token: 'test-token',
        user: { id: 1, email: 'admin@csub.edu', displayName: 'Admin', role: 'sysadmin' },
      }),
    });

    render(<AdminLogin onLogin={mockOnLogin} />);
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'admin@csub.edu' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ email: 'admin@csub.edu' })
      );
    });
  });
});
```

- [ ] **Step 3: Create client/src/__tests__/TimelineStep.test.tsx**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimelineStep from '../components/roadmap/TimelineStep.jsx';
import type { StepWithStatus } from '../types/api.js';

// Mock DeadlineCountdown
vi.mock('../components/roadmap/DeadlineCountdown.jsx', () => ({
  default: () => null,
}));

function makeStep(overrides: Partial<StepWithStatus> = {}): StepWithStatus {
  return {
    id: 1,
    title: 'Submit Application',
    description: 'Fill out the application form',
    icon: '📝',
    sort_order: 1,
    is_public: 0,
    is_optional: 0,
    deadline: null,
    deadline_date: null,
    links: null,
    guide_content: null,
    contact_info: null,
    required_tags: null,
    excluded_tags: null,
    required_tag_mode: null,
    link_url: null,
    link_label: null,
    category: null,
    api_check_type: null,
    status: 'not_started',
    ...overrides,
  };
}

describe('TimelineStep', () => {
  const defaultProps = {
    index: 0,
    totalSteps: 5,
    isSelected: false,
    isPreview: false,
    onClick: vi.fn(),
  };

  it('renders step title', () => {
    render(<TimelineStep step={makeStep()} {...defaultProps} />);
    expect(screen.getByText('Submit Application')).toBeDefined();
  });

  it('shows Completed badge for completed status', () => {
    render(<TimelineStep step={makeStep({ status: 'completed' })} {...defaultProps} />);
    expect(screen.getByText('Completed')).toBeDefined();
  });

  it('shows In Progress badge for in_progress status', () => {
    render(<TimelineStep step={makeStep({ status: 'in_progress' })} {...defaultProps} />);
    expect(screen.getByText('In Progress')).toBeDefined();
  });

  it('shows Waived badge for waived status', () => {
    render(<TimelineStep step={makeStep({ status: 'waived' })} {...defaultProps} />);
    expect(screen.getByText('Waived')).toBeDefined();
  });

  it('shows Not Started badge for not_started status', () => {
    render(<TimelineStep step={makeStep({ status: 'not_started' })} {...defaultProps} />);
    expect(screen.getByText('Not Started')).toBeDefined();
  });

  it('renders emoji icon', () => {
    render(<TimelineStep step={makeStep({ icon: '🎓' })} {...defaultProps} />);
    expect(screen.getByText('🎓')).toBeDefined();
  });
});
```

- [ ] **Step 4: Run client tests**

Run: `cd client && npx vitest run`
Expected: All tests PASS

---

### Task 11: Full Test Suite Run & Verification

- [ ] **Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All unit and integration tests PASS

- [ ] **Step 2: Run all client tests**

Run: `cd client && npx vitest run`
Expected: All component tests PASS

- [ ] **Step 3: Run root test command**

Run: `npm test`
Expected: Both server and client test suites PASS

- [ ] **Step 4: Verify type-check still passes**

Run: `npm run type-check`
Expected: No TypeScript errors
