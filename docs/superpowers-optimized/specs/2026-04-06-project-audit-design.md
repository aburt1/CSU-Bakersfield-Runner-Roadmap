# Project Audit & Simplification Design

## Scope

Refactor the CSUB Admissions server codebase for maintainability without losing any features.

## Non-Goals

- No service layer extraction (premature for current project size)
- No client-side changes (already clean)
- No new frameworks or libraries
- No API behavior changes
- No database schema changes

---

## Phase 1: Remove Unused Dependency

Remove `@azure/msal-node` from `server/package.json`. Confirmed never imported anywhere - Azure AD token verification uses `jsonwebtoken` + `crypto` directly in `server/utils/azureAdToken.ts`.

**Files:** `server/package.json`

---

## Phase 2: Extract Shared Helpers

Create `server/utils/queryHelpers.ts` with:

### `parseTermId(req: Request): number | null`
Replaces 20+ occurrences of:
```typescript
const termId = req.query.term_id ? parseInt(req.query.term_id as string, 10) : null;
```

### `parsePagination(req: Request, defaults?: { perPage?: number }): { page: number; perPage: number; offset: number }`
Replaces 5+ occurrences of the page/perPage/offset calculation block.

### `countActiveSteps(db: Db, termId: number): Promise<number>`
Replaces 10+ occurrences of `SELECT COUNT(*) FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0 AND term_id = $1`.

### `ACTIVE_STEP_FILTER` constant
SQL fragment: `'is_active = 1 AND COALESCE(is_optional, 0) = 0'`

**Files:** `server/utils/queryHelpers.ts` (new)

---

## Phase 3: Split admin.ts into Domain Modules

Convert `server/routes/admin.ts` (1,660 lines) into `server/routes/admin/` directory:

| File | Lines | Content | Source Lines |
|------|-------|---------|-------------|
| `index.ts` | ~30 | Mount sub-routers, apply `adminAuth` | New |
| `steps.ts` | ~265 | Step CRUD, reorder, duplicate, bulk ops | 19-265 |
| `students.ts` | ~400 | Student list, progress, tags, audit logs | 267-607 |
| `analytics.ts` | ~560 | Stats, CSV export, all analytics endpoints | 609-1321 |
| `terms.ts` | ~190 | Term CRUD, cloning | 1323-1510 |
| `users.ts` | ~120 | Admin user CRUD, integration keys | 1538-1660 |

### Router composition pattern:
```typescript
// admin/index.ts
const router = Router();
router.use(adminAuth);    // applied once
router.use(stepsRouter);
router.use(studentsRouter);
router.use(analyticsRouter);
router.use(termsRouter);
router.use(usersRouter);
export default router;
```

### Import in server/index.ts stays unchanged:
`import adminRouter from './routes/admin.js'` resolves to `./routes/admin/index.js` under ESM.

**Files:** Delete `server/routes/admin.ts`, create `server/routes/admin/{index,steps,students,analytics,terms,users}.ts`

---

## Phase 4: Simplify Analytics Students Endpoint

The `GET /analytics/students` handler (283 lines, 8-case switch) is refactored into named builder functions:

```typescript
interface FilterQuerySet {
  title: string;
  studentQuery: string;
  countQuery: string;
  params: unknown[];
  countParams: unknown[];
}

type FilterBuilder = (db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number, totalActiveSteps: number) => Promise<FilterQuerySet>;
```

Each switch case becomes a function: `buildStepCompletedFilter`, `buildStepNotCompletedFilter`, `buildCohortBucketFilter`, `buildTagFilter`, `buildStalledFilter`, `buildDeadlineRiskFilter`, `buildVelocityBucketFilter`, `buildTrendDateFilter`.

The main handler uses a `Record<string, FilterBuilder>` lookup. Drops from 283 to ~40 lines.

All builder functions stay in `analytics.ts` (no new file).

**Files:** `server/routes/admin/analytics.ts`

---

## Verification Plan

1. **After each phase:** `npm run type-check`
2. **Route count audit:** 24 route registrations in original admin.ts must equal sum across all sub-files after Phase 3
3. **Endpoint smoke test:** Hit each endpoint group after Phase 3:
   - `GET /api/admin/steps`
   - `GET /api/admin/students`
   - `GET /api/admin/stats`
   - `GET /api/admin/analytics/step-completion`
   - `GET /api/admin/terms`
   - `GET /api/admin/users`
   - `GET /api/admin/audit`
4. **Analytics deep test:** After Phase 4, test all 8 `filter_type` values
5. **Docker build:** `docker build .` succeeds after all phases

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Module resolution `admin.ts` -> `admin/index.ts` | Low | Test explicitly; trivial fix if needed |
| Dropped route during split | Critical | Count 24 routes before/after |
| SQL parameter ordering in analytics builders | Critical | Test all 8 filter types |

---

## Decided Against

| Pattern | Why Not |
|---------|---------|
| Generic update helper | 4 occurrences but transforms differ per entity |
| Service layer | Premature for current project size |
| Move `@faker-js/faker` to devDeps | Breaks Dockerfile seeding |
| `@tiptap/pm` removal | Required as peer dependency |
| Client refactoring | Already clean |
