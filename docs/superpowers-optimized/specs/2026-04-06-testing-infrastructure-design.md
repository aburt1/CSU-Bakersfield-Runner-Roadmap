# Testing Infrastructure Design

## Date
2026-04-06

## Problem
The project has zero test infrastructure. A SQL parameter mismatch bug was found during refactoring — the `cohort_bucket` filter builder for `0%` passed 5 SQL params to a query expecting 2. This bug class (dynamic SQL construction with `paramBuilder()`) exists across 34 admin routes and is invisible until a specific code path is hit at runtime.

## Scope
- Server: Integration tests for all 34 admin routes (+ auth and public routes), unit tests for shared utilities
- Client: Smoke tests for key components
- Framework: Vitest for both server and client

## Non-Goals
- No database mocking (integration tests hit real PostgreSQL)
- No end-to-end browser tests (Playwright/Cypress)
- No CI pipeline setup
- No coverage thresholds initially

## Approach: Hybrid (Integration + Unit + Component)

### Layer 1: Server Integration Tests (~80 tests)
Each test runs inside a PostgreSQL transaction that rolls back after the test. Dev DB stays clean.

#### Test DB Strategy
- Uses existing dev database via `DATABASE_URL`
- `initDatabase()` runs once in `beforeAll` to ensure schema + seed data
- Each test wrapped in `BEGIN` / `ROLLBACK`
- PostgreSQL nested transactions (savepoints) handle routes that call `db.transaction()` internally

#### Auth Strategy
- Generate real JWTs with a known `JWT_SECRET` set in test env
- Helper: `makeTestToken(role)` returns a Bearer token for any admin role
- Tests send `Authorization: Bearer <token>` header via supertest

#### Supertest Setup
- Express app created once in setup
- Transactional `db` injected via middleware override per test

#### Route Coverage (34 routes × 2+ cases)
For every route:
- Happy path — valid request, expected response shape
- Edge case — boundary values, empty results, missing optional params
- Auth/role — verify `requireRole` rejects lower roles
- Invalid input — bad IDs, missing required fields

#### High-Priority Edge Cases (The Bug Class)

| Route / Builder | Edge Case | What It Catches |
|---|---|---|
| `cohort_bucket` filter | Every bucket: `0%`, `1-25%`, `26-50%`, `51-75%`, `76-100%` | SQL param count mismatch per branch |
| `cohort_bucket` filter | `totalActiveSteps = 0` | Division by zero |
| `stalled` filter | Each range: `7-14 days`, `2-4 weeks`, `1-3 months`, `3+ months` | Param alignment in HAVING clause |
| `velocity_bucket` filter | Each range value | Param alignment |
| `stalled` / `velocity_bucket` | Invalid range string | Error handling |
| All filter builders | `filterValue = undefined` | Null safety |
| `completion-trend` | `term_id` present vs absent | Conditional `$1`/`$2` swapping |
| `deadline-risk` | `term_id` present vs absent | Dynamic `$N` via `params.push()` |
| `stalled-students` | `term_id` present vs absent | Same dynamic pattern |
| Student list | All 6 sort options | SQL injection via sort key |
| Student list | Search + term_id + overdue_only combined | Multi-param WHERE building |
| Term clone | `step_ids` with mixed valid/invalid IDs | Placeholder count vs params |
| CSV export | Zero students, zero steps | Empty array edge case |
| Audit log | All filter combos (studentId + action + q) | Multi-param WHERE building |

### Layer 2: Server Unit Tests (~25 tests)

| Module | Tests |
|---|---|
| `paramBuilder` | Sequential counting, custom start, concurrent builders |
| `parseTermId` | Valid, missing, non-numeric |
| `parsePagination` | Defaults, max cap at 100, page < 1 |
| `countActiveSteps` | With data, with zero steps |
| `safeJsonParse` | Valid JSON, invalid JSON, null input |
| `studentTags` | Manual tags, derived tags from fields, merge priority |
| `progress` | Status transitions: not_completed->completed, completed->waived, noop cases |

### Layer 3: Client Component Tests (~8 tests)

| Component | Tests |
|---|---|
| `App` | Renders without crash |
| `AdminLogin` | Form renders, submit calls API |
| `StepCard` | Renders completed/incomplete/locked states |

Client tests mock `fetch` — no API server needed.

## File Structure

```
server/
  vitest.config.ts
  tests/
    setup.ts                    # DB connection, transaction wrapper, JWT helper
    integration/
      admin-steps.test.ts
      admin-students.test.ts
      admin-analytics.test.ts
      admin-terms.test.ts
      admin-users.test.ts
      auth.test.ts
      student-api.test.ts
    unit/
      paramBuilder.test.ts
      queryHelpers.test.ts
      progress.test.ts
      studentTags.test.ts
      json.test.ts
client/
  vitest.config.ts
  src/__tests__/
    App.test.tsx
    AdminLogin.test.tsx
    StepCard.test.tsx
```

## Dependencies

**Server (devDependencies):**
- `vitest`
- `supertest`
- `@types/supertest`

**Client (devDependencies):**
- `vitest`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `jsdom`

## Package Scripts

```jsonc
// server/package.json
"test": "vitest run",
"test:watch": "vitest",
"test:integration": "vitest run tests/integration",
"test:unit": "vitest run tests/unit"

// client/package.json
"test": "vitest run",
"test:watch": "vitest"

// root package.json
"test": "cd server && npm test && cd ../client && npm test"
```

## Failure Modes (Minor — All Mitigated)

1. **Parallel test isolation**: Integration tests run sequentially (`--no-threads`) to prevent DB conflicts between files.
2. **Nested transactions**: Routes using `db.transaction()` create PostgreSQL savepoints inside the test's outer transaction. Outer `ROLLBACK` still undoes everything.
3. **Client fetch calls**: Components that fetch on mount are tested with mocked `fetch`. No API server needed.
