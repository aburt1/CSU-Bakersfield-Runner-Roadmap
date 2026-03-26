# Seed Data & Live Simulator Design

## Context
The app currently seeds 50 hardcoded students with no audit log entries. For demo and review purposes, we need realistic-scale data: 1,234 students at every completion level, a full audit history, and a live background simulator that creates ongoing activity.

## Architecture
Two new modules, one new dev dependency:
- `server/db/seed.js` — standalone CLI script for bulk data generation
- `server/utils/simulator.js` — background loop for live activity simulation
- `@faker-js/faker` — dev dependency for realistic name/profile generation

## Seed Script (`server/db/seed.js`)

### Usage
```bash
node server/db/seed.js          # insert 1,234 students (prompts if >100 exist)
node server/db/seed.js --force  # skip the safety prompt
node server/db/seed.js --clean  # remove seed-* students first, then insert fresh
```

Add `"seed": "node server/db/seed.js"` to package.json scripts.

### Student Generation (1,234 students)
- **Library:** `@faker-js/faker` with fixed seed for reproducible output
- **Names:** Diverse names reflecting Central Valley demographics (locale mixing)
- **Email:** `{first}{last_initial}@csub.edu` with numeric dedup suffix for collisions
- **ID format:** `seed-demo-{padded 4-digit number}` (0000–1233)
- **Emplid:** `002000000` through `002001233`
- **Profile fields:**
  - Applicant type: Freshman 50%, Transfer 35%, Readmit 15%
  - Major: random from existing 10 majors (Business, CS, Psychology, Nursing, Engineering, Biology, Criminal Justice, Kinesiology, Sociology, Liberal Studies)
  - Residency: 80% In-State, 20% Out-of-State
  - Phone: random `(661) 6xx-xxxx` format
  - Preferred name: 15% of students get one
- **Tags:** weighted random from existing pool (`first-gen`, `honors`, `eop`, `athlete`, `veteran`, combos, and none)
- **`created_at`:** random date 30–60 days in the past
- **Term:** assigned to the active term

### Progress Distribution (Even Spread)
- 1,234 students ÷ 18 completion levels (0 through 17 steps) ≈ 68–69 students per level
- Steps completed in sort_order (student with 5 steps done has first 5 required steps completed)
- Status: 90% `completed`, 10% `waived`
- `completed_at` timestamps: spaced 1–3 days apart starting from student's `created_at`
- `completed_by`: `'manual'` for admin-attributed, `'integration'` for system-attributed

### Audit Log Generation
- One audit entry per progress record (each completion/waive gets a log entry)
- **Historical timestamps:** The seed script inserts directly into `audit_log` with explicit `created_at` values (bypassing `logAudit()` which only supports `NOW()`). This produces a realistic timeline spanning from earliest student enrollment through today.
- `changed_by` distribution: 70% `system`/integration names (e.g., `"PeopleSoft Dev"`), 20% student self-service (student display name), 10% admin names (e.g., `"Admin"`, `"Maria Santos"`, `"James Chen"`)
- Additional audit entries: ~200 tag changes and profile sync events spread across the timeline
- Entity types used: `student_progress`, `student_tags`, `student_profile`
- Actions used (matching exact codebase strings): `complete`, `waive`, `uncomplete`, `student_optional_complete`, `student_optional_uncomplete`, `integration_complete`, `integration_waive`, `integration_uncomplete`, `tags_update`, `student_profile_update`
- Estimated total: 8,000–10,000 audit entries spanning from earliest student `created_at` through today

**Note on `completed_by` vs `changed_by`:** These are distinct fields on different tables. `completed_by` on `student_progress` is a status flag (`'manual'` or `'integration'`). `changed_by` on `audit_log` is the human-readable actor name. The seed script sets both appropriately.

### Performance
- Uses batch INSERT statements (100 rows per batch) for students, progress, and audit entries
- Logs progress: student count, progress records, audit entries, total elapsed time
- Expected runtime: <10 seconds on local PostgreSQL

### Safety
- Checks if >100 students already exist; prompts confirmation unless `--force`
- `--clean` flag: deletes in FK-safe order: (1) `student_progress` where `student_id LIKE 'seed-demo-%'`, (2) `audit_log` where `entity_id LIKE 'seed-demo-%'`, (3) `students` where `id LIKE 'seed-demo-%'`. This order avoids foreign key violations since `student_progress` has an FK to `students` without `ON DELETE CASCADE`.
- Never deletes non-seed data (the original 50 `seed-student-*` entries or real users)

## Live Simulator (`server/utils/simulator.js`)

### Behavior
Background loop running every 30–60 seconds (random interval per tick). Each tick picks a random student and performs one action.

### Action Weights
| Action | Weight | Description |
|--------|--------|-------------|
| Complete next step | 60% | Student's next incomplete required step gets completed |
| Undo a completion | 15% | Most recently completed step gets undone |
| Waive a step | 10% | Random incomplete required step gets waived |
| Complete optional step | 10% | Random incomplete optional step gets completed |
| Undo optional step | 5% | Random completed optional step gets undone |

### Implementation
- Uses existing `applyStudentProgressChange()` from `server/utils/progress.js`
- Uses existing `logAudit()` from `server/utils/audit.js` (passes a mock `req` object with the simulated actor). Since the simulator runs in real-time, `NOW()` timestamps from `logAudit()` are correct.
- Must check for `result !== 'noop'` before calling `logAudit()` to avoid phantom audit entries (matching the pattern used in existing route handlers)
- Audit `changed_by` rotates between: `"PeopleSoft Sync"`, `"Admissions Bot"`, `"CRM Import"`, random admin names, and student self-service (student's own name). The `completed_by` field on progress is set to `'integration'` for system actors or `'manual'` for admin/student actors.
- Console output per action: `[simulator] Completed "Submit Intent to Enroll" for Sofia Garcia`

### Activation
- Starts automatically when `NODE_ENV !== 'production'`
- Disabled by setting env var `DISABLE_SIMULATOR=1`
- Gracefully no-ops if no students exist in the database
- Exported as `startSimulator(db)` function

## Changes to Existing Files

### `server/index.js`
~3 lines added after DB initialization:
```javascript
if (process.env.NODE_ENV !== 'production' && !process.env.DISABLE_SIMULATOR) {
  const { startSimulator } = await import('./utils/simulator.js');
  startSimulator(db);
}
```

### `package.json`
- Add script: `"seed": "node server/db/seed.js"`
- Add dev dependency: `@faker-js/faker`

### No other existing files are modified.

## New Files
| File | Purpose |
|------|---------|
| `server/db/seed.js` | Standalone CLI seed script |
| `server/utils/simulator.js` | Background activity simulator |

## Verification
After running `node server/db/seed.js`:
1. Admin Students tab shows 1,234+ students with pagination working
2. Analytics charts populate with meaningful distributions across all completion levels
3. Audit Log tab shows thousands of entries with mixed actors and actions
4. Overdue filter shows students with incomplete steps past deadline
5. Summary stats reflect the full student body

After starting dev server with simulator:
1. Console shows periodic `[simulator]` messages every 30–60 seconds
2. Refreshing the admin Students tab or Analytics shows changing numbers
3. Audit Log tab shows new entries appearing in real-time
4. Setting `DISABLE_SIMULATOR=1` stops the activity
