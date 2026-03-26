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
- Timestamps match the progress `completed_at`
- `changed_by` distribution: 70% `system`/integration names, 20% student self-service (student display name), 10% admin names (e.g., "Admin", "Maria Santos", "James Chen")
- Additional audit entries: ~200 tag changes and profile sync events spread across the timeline
- Entity types used: `student_progress`, `student_tags`, `student_profile`
- Actions used: `complete`, `waive`, `student_optional_complete`, `integration_complete`, `integration_waive`, `tags_updated`, `profile_synced`
- Estimated total: 8,000–10,000 audit entries spanning from earliest student `created_at` through today

### Performance
- Uses batch INSERT statements (100 rows per batch) for students, progress, and audit entries
- Logs progress: student count, progress records, audit entries, total elapsed time
- Expected runtime: <10 seconds on local PostgreSQL

### Safety
- Checks if >100 students already exist; prompts confirmation unless `--force`
- `--clean` flag: deletes students with `id LIKE 'seed-demo-%'` and their associated progress/audit entries before inserting
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
- Uses existing `logAudit()` from `server/utils/audit.js` (passes a mock `req` object with the simulated actor)
- `changed_by` rotates between: `"PeopleSoft Sync"`, `"Admissions Bot"`, `"CRM Import"`, random admin names, and student self-service (student's own name)
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
