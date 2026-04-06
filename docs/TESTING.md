# Testing Guide

## Overview

The project uses **Vitest** for both server and client tests. Server integration tests run against a real PostgreSQL database using transaction rollbacks for isolation — no mocking of the database layer.

| Suite | Tests | Framework | Environment |
|-------|-------|-----------|-------------|
| Server unit | 37 | Vitest | Node.js |
| Server integration | 108 | Vitest + Supertest | Node.js + PostgreSQL |
| Client components | 9 | Vitest + Testing Library | jsdom |

---

## Running Tests

```bash
# Run all tests (server + client)
npm test

# Server tests only
npm run test:server

# Client tests only
npm run test:client

# Watch mode (useful during development)
cd server && npx vitest --watch
cd client && npx vitest --watch
```

Tests require a running PostgreSQL instance with the `csub_admissions` database. The server's `.env` file must have a valid `DATABASE_URL`.

---

## Test Strategy

### Server Integration Tests

Integration tests use **transaction rollback isolation**:

1. `beforeAll` — Connects to PostgreSQL, runs schema init
2. `beforeEach` — Begins a transaction (`BEGIN`)
3. Each test — Runs HTTP requests against a fresh Express app with the transactional DB injected
4. `afterEach` — Rolls back the transaction (`ROLLBACK`), undoing all changes

This means tests run against real SQL queries and real PostgreSQL behavior, catching bugs that mocked databases would miss (like the SQL parameter mismatch bug in analytics filters).

**Nested transactions:** Routes that call `db.transaction()` internally use PostgreSQL savepoints instead of a real nested transaction, so they work correctly inside the outer test transaction.

### Server Unit Tests

Pure function tests with no database or HTTP dependencies. These cover:

- `paramBuilder()` — SQL parameter placeholder generation
- `parseTermId()`, `parsePagination()` — Request parsing utilities
- `safeJsonParse()` — Safe JSON deserialization
- Student tag derivation and merging
- Progress normalization helpers

### Client Component Tests

React component tests using `@testing-library/react` with a jsdom environment. Global mocks are set up for:

- `fetch` — Returns `{ ok: true, json: () => ({}) }` by default, overridden per test
- `framer-motion` — Replaced with passthrough elements to avoid animation issues

---

## What's Covered

### Server Routes (34 admin + auth routes)

| Route Group | File | Key Tests |
|-------------|------|-----------|
| Admin auth | `auth.test.ts` | Login validation, JWT token flow, password changes |
| Student auth | `auth.test.ts` | Dev login, student /me endpoint |
| Steps CRUD | `admin-steps.test.ts` | Create, read, update, delete, role guards |
| Students | `admin-students.test.ts` | List with sorting, filters, progress updates, tags |
| Analytics | `admin-analytics.test.ts` | All filter builders, cohort buckets, stalled ranges |
| Terms | `admin-terms.test.ts` | CRUD, clone with steps, delete guards |
| Users | `admin-users.test.ts` | CRUD, duplicate email detection, role guards |

### Edge Cases Specifically Tested

The analytics test file (`admin-analytics.test.ts`) was designed to catch SQL parameter mismatch bugs by testing every filter builder branch:

- **Cohort buckets:** 0%, 1-25%, 26-50%, 51-75%, 76-100%
- **Stalled ranges:** 7-14 days, 2-4 weeks, 1-3 months, 3+ months
- **Velocity buckets:** All ranges
- **Term ID present vs absent** for every analytics endpoint

---

## Adding New Tests

### Server Integration Test

1. Create a file in `server/tests/integration/`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, adminToken } from '../setup.js';

describe('GET /api/admin/your-endpoint', () => {
  it('returns expected data', async () => {
    const res = await request(app)
      .get('/api/admin/your-endpoint')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(res.body).toBeDefined();
  });
});
```

2. Use `adminToken(role)` for admin routes or `studentToken(id)` for student routes
3. Any database changes are automatically rolled back after each test

### Server Unit Test

1. Create a file in `server/tests/unit/`:

```typescript
import { describe, it, expect } from 'vitest';
import { yourFunction } from '../../utils/yourModule.js';

describe('yourFunction', () => {
  it('handles normal input', () => {
    expect(yourFunction('input')).toBe('expected');
  });
});
```

### Client Component Test

1. Create a file in `client/src/__tests__/`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import YourComponent from '../components/YourComponent';

describe('YourComponent', () => {
  it('renders correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeDefined();
  });
});
```

2. Mock fetch responses per test if the component makes API calls:

```typescript
(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
  ok: true,
  json: () => Promise.resolve({ data: 'mock' }),
});
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `server/vitest.config.ts` | Server test config — loads `.env`, sets `JWT_SECRET` and `NODE_ENV` |
| `server/tests/setup.ts` | Test infrastructure — DB connection, transaction management, app factory |
| `client/vitest.config.ts` | Client test config — jsdom environment, React plugin |
| `client/src/__tests__/setup.ts` | Client setup — global fetch mock, framer-motion mock |
