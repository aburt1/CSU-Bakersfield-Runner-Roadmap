# Seed Data & Live Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the app with 1,234 realistic students, full audit history, and a live background simulator so the app looks production-ready for demo.

**Architecture:** A standalone CLI seed script (`server/db/seed.js`) generates students, progress, and audit data via batch INSERTs. A separate simulator module (`server/utils/simulator.js`) runs a background loop in dev mode, performing one realistic action every 30–60 seconds using existing progress/audit utilities.

**Tech Stack:** Node.js, PostgreSQL, `@faker-js/faker` (dev dependency)

**Spec:** `docs/superpowers/specs/2026-03-26-seed-data-simulator-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/db/seed.js` | Create | CLI script: generate 1,234 students, progress, audit log |
| `server/utils/simulator.js` | Create | Background loop: periodic realistic actions in dev mode |
| `server/index.js` | Modify (lines 107-108) | Start simulator after server listen |
| `server/package.json` | Modify | Add `@faker-js/faker` dev dependency |
| `package.json` (root) | Modify | Add `"seed"` script |

---

### Task 1: Install faker dependency

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install `@faker-js/faker` as a dev dependency in the server package**

```bash
cd /Users/aburt1/Desktop/roadmap/CSUB-admissions/server && npm install --save-dev @faker-js/faker
```

Expected: `package.json` now has `@faker-js/faker` in `devDependencies`.

- [ ] **Step 2: Add seed script to root `package.json`**

In `/Users/aburt1/Desktop/roadmap/CSUB-admissions/package.json`, add to `"scripts"`:
```json
"seed": "cd server && node db/seed.js"
```

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json package.json
git commit -m "chore: add @faker-js/faker dev dependency and seed script"
```

---

### Task 2: Create seed script — student generation

**Files:**
- Create: `server/db/seed.js`

This task creates the seed script with just the student generation portion. Progress and audit log come in the next tasks.

- [ ] **Step 1: Create `server/db/seed.js` with student generation logic**

Create the file with these sections:
1. **Imports:** `dotenv`, `@faker-js/faker` (use `fakerEN` plus `fakerES_MX` for diverse Central Valley names), `readline`, `createDb` from `./pool.js`
2. **Constants:**
   - `STUDENT_COUNT = 1234`
   - `BATCH_SIZE = 100`
   - `MAJORS` array — 20 actual CSUB undergraduate programs (from spec)
   - `APPLICANT_TYPES` — weighted: `['First-Time Freshman', 'First-Time Freshman', 'First-Time Freshman', 'Transfer', 'Transfer', 'Transfer', 'Transfer', 'Readmit']` (gives ~50/35/15 split with integer weights)
   - `TAG_OPTIONS` — weighted array: `[['first-gen'], ['honors'], ['eop'], ['athlete'], ['veteran'], ['first-gen', 'honors'], ['first-gen', 'eop'], [], [], [], []]` (empty = no tags)
3. **`generateStudents(count)` function:**
   - Set faker seed: `faker.seed(42)` for reproducibility
   - Loop `count` times, generating each student object:
     - `id`: `seed-demo-${String(i).padStart(4, '0')}`
     - `display_name`: For ~40% of students use `fakerES_MX.person.firstName()` + `fakerES_MX.person.lastName()` for Hispanic names; remainder use `faker.person.firstName()` + `faker.person.lastName()`. This reflects Kern County demographics.
     - `email`: `{first.toLowerCase()}{last.toLowerCase().charAt(0)}@csub.edu` — track used emails in a Set, append numeric suffix for collisions (e.g., `sofiam2@csub.edu`)
     - `azure_id`: `azure-demo-${id}`
     - `emplid`: `${100200000 + i}` (9-digit CSUB format)
     - `applicant_type`: pick from weighted array using `i % APPLICANT_TYPES.length`
     - `major`: pick from `MAJORS` using `i % MAJORS.length`
     - `residency`: `i % 5 === 0 ? 'Out-of-State' : 'In-State'` (80/20 split)
     - `phone`: `(661) 6${faker.string.numeric(2)}-${faker.string.numeric(4)}`
     - `preferred_name`: `i % 7 === 0 ? faker.person.firstName() : null` (~15%)
     - `admit_term`: `'Fall 2026'`
     - `tags`: pick from `TAG_OPTIONS` using `i % TAG_OPTIONS.length` — **must `JSON.stringify()` the array** (or pass `null` for empty). The `tags` column is `TEXT` storing JSON strings, not a PostgreSQL array. Match the pattern in `init.js` line 339.
     - `created_at`: random date 30–60 days ago: `new Date(Date.now() - (30 + Math.floor(faker.number.int({ max: 30 }))) * 86400000).toISOString()`
   - Return array of student objects

4. **`insertStudentsBatch(db, students, termId)` function:**
   - Loop in batches of `BATCH_SIZE`
   - For each batch, build a multi-row INSERT:
     ```sql
     INSERT INTO students (id, display_name, email, azure_id, tags, term_id, created_at,
       emplid, preferred_name, phone, applicant_type, major, residency, admit_term, last_synced_at)
     VALUES ($1,$2,...), ($16,$17,...), ...
     ```
   - Use paramBuilder pattern or manual `$N` numbering
   - Use `ON CONFLICT (id) DO NOTHING` to handle re-runs without `--clean` gracefully (azure_id and emplid are deterministic, so duplicates would fail on unique constraints otherwise)
   - `last_synced_at`: same as `created_at` plus random 0-7 days
   - **Important:** `JSON.stringify()` the tags array and the details objects before passing as SQL parameters

5. **`cleanSeedData(db)` function:**
   - Delete in FK-safe order:
     ```sql
     DELETE FROM student_progress WHERE student_id LIKE 'seed-demo-%'
     DELETE FROM audit_log WHERE entity_id LIKE 'seed-demo-%'
     DELETE FROM students WHERE id LIKE 'seed-demo-%'
     ```
   - Log count of rows deleted from each table

6. **`confirm(question)` function:**
   - Uses `readline` to prompt user, returns boolean promise

7. **`main()` function (partial — progress/audit added in later tasks):**
   - `dotenv.config()`
   - `const db = createDb()`
   - Parse `--force` and `--clean` from `process.argv`
   - If `--clean`: call `cleanSeedData(db)`, log result
   - Check existing student count: `SELECT COUNT(*) FROM students`
   - If count > 100 and no `--force`: prompt with `confirm()`, exit if declined
   - Get active term: `SELECT id FROM terms WHERE is_active = 1 ORDER BY id LIMIT 1`
   - Call `generateStudents(STUDENT_COUNT)`
   - Call `insertStudentsBatch(db, students, termId)`
   - Log: `✓ Inserted ${count} students`
   - `await db.end()` and `process.exit(0)`
   - Call `main()` at bottom of file

- [ ] **Step 2: Test the seed script**

```bash
cd /Users/aburt1/Desktop/roadmap/CSUB-admissions && node server/db/seed.js --force
```

Expected: `✓ Inserted 1234 students` with no errors. Verify in admin UI that students appear.

- [ ] **Step 3: Test the `--clean` flag**

```bash
node server/db/seed.js --clean --force
```

Expected: Cleans seed-demo students, then re-inserts 1,234. No FK violations.

- [ ] **Step 4: Commit**

```bash
git add server/db/seed.js
git commit -m "feat: add seed script with 1,234 realistic CSUB students"
```

---

### Task 3: Add progress distribution to seed script

**Files:**
- Modify: `server/db/seed.js`

- [ ] **Step 1: Add progress generation to `main()`**

After inserting students, add progress generation:

1. **Query steps:** `SELECT id, sort_order, is_optional FROM steps WHERE term_id = $1 AND is_active = 1 ORDER BY sort_order` — separate into `requiredSteps` and `optionalSteps`
2. **Calculate distribution:** `totalLevels = requiredSteps.length + 1` (0 through N). For 1,234 students: `studentsPerLevel = Math.floor(1234 / totalLevels)`, remainder distributed to first levels.
3. **Assign completion level** to each student:
   - Students 0–(studentsPerLevel-1) get 0 steps
   - Students studentsPerLevel–(2*studentsPerLevel-1) get 1 step
   - And so on...
4. **Generate progress records** for each student:
   - For student with `N` required steps completed: insert progress for `requiredSteps.slice(0, N)`
   - Status: `Math.random() < 0.1 ? 'waived' : 'completed'` (10% waived)
   - `completed_at`: start from student's `created_at`, add 1–3 days per step: `new Date(studentCreatedAt.getTime() + (j + 1) * (86400000 + Math.floor(Math.random() * 2 * 86400000)))`
   - `completed_by`: `Math.random() < 0.7 ? 'integration' : 'manual'`
   - Also give ~30% of students at least one optional step completed (randomly pick from `optionalSteps`)
5. **Batch INSERT** progress records (100 per batch):
   ```sql
   INSERT INTO student_progress (student_id, step_id, completed_at, status, completed_by)
   VALUES ($1,$2,$3,$4,$5), ...
   ```
6. Log: `✓ Inserted ${count} progress records`

- [ ] **Step 2: Test progress generation**

```bash
node server/db/seed.js --clean --force
```

Expected: Students inserted, then progress records. Check admin UI — students should show varying completion levels across all steps. Analytics charts should populate with meaningful distributions.

- [ ] **Step 3: Commit**

```bash
git add server/db/seed.js
git commit -m "feat: add even-spread progress distribution to seed script"
```

---

### Task 4: Add audit log generation to seed script

**Files:**
- Modify: `server/db/seed.js`

- [ ] **Step 1: Add audit log generation after progress insertion**

Add constants:
```javascript
const SYSTEM_ACTORS = ['PeopleSoft Dev', 'CRM Import', 'Admissions Bot', 'system'];
const ADMIN_ACTORS = ['Admin', 'Maria Santos', 'James Chen', 'Pat Williams'];
```

Add `generateAuditEntries(students, progressRecords, steps)` function:
1. **Progress audit entries** — one per progress record:
   - `entity_type`: `'student_progress'`
   - `entity_id`: student id
   - `action`: pick based on `completed_by` and status:
     - If `completed_by === 'integration'` and status `'completed'`: `'integration_complete'`
     - If `completed_by === 'integration'` and status `'waived'`: `'integration_waive'`
     - If status `'completed'`: `'complete'`
     - If status `'waived'`: `'waive'`
   - `changed_by`: 70% system actor (random from `SYSTEM_ACTORS`), 20% student name, 10% admin actor (random from `ADMIN_ACTORS`)
   - `details`: JSON string with `{ stepId, stepTitle, studentName, result: 'created' }`
   - `created_at`: same as the progress record's `completed_at`

2. **Tag update entries** — ~200 entries spread across students:
   - Pick 200 random students
   - `entity_type`: `'student_tags'`
   - `action`: `'tags_update'`
   - `changed_by`: random admin actor
   - `details`: `{ tags: student.tags }`
   - `created_at`: random time between student's `created_at` and now

3. **Profile sync entries** — ~200 entries:
   - Pick 200 random students
   - `entity_type`: `'student_profile'`
   - `action`: `'student_profile_update'`
   - `changed_by`: `'PeopleSoft Dev'`
   - `details`: `{ source: 'PeopleSoft', fields: ['major', 'residency'] }`
   - `created_at`: random time between student's `created_at` and now

Return flat array of all audit entries.

4. **Batch INSERT** audit entries (100 per batch) — insert directly with explicit `created_at`:
   ```sql
   INSERT INTO audit_log (entity_type, entity_id, action, changed_by, details, created_at)
   VALUES ($1,$2,$3,$4,$5,$6), ...
   ```
   **Important:** The `details` column is `TEXT` storing JSON. Always `JSON.stringify()` the details object before passing as a parameter (matching `logAudit()` pattern in `server/utils/audit.js` line 20).

5. Log: `✓ Inserted ${count} audit log entries`

- [ ] **Step 2: Test full seed with audit log**

```bash
node server/db/seed.js --clean --force
```

Expected: Students, progress, and audit entries all inserted. Output should show counts for each. Check admin Audit Log tab — should show thousands of entries with mixed actors, actions, and dates spanning weeks.

- [ ] **Step 3: Add summary output at end of `main()`**

After all inserts, log a summary:
```
✓ Seed complete in 3.2s
  • 1,234 students
  • 8,456 progress records
  • 9,012 audit log entries
```

- [ ] **Step 4: Commit**

```bash
git add server/db/seed.js
git commit -m "feat: add audit log generation to seed script"
```

---

### Task 5: Create live simulator

**Files:**
- Create: `server/utils/simulator.js`

- [ ] **Step 1: Create `server/utils/simulator.js`**

Structure:
1. **Imports:** `applyStudentProgressChange` from `./progress.js`, `logAudit` from `./audit.js`

2. **Constants:**
   ```javascript
   const MIN_INTERVAL = 30000;  // 30 seconds
   const MAX_INTERVAL = 60000;  // 60 seconds
   const ACTORS = [
     { type: 'integration', name: 'PeopleSoft Sync' },
     { type: 'integration', name: 'Admissions Bot' },
     { type: 'integration', name: 'CRM Import' },
     { type: 'admin', name: 'Maria Santos' },
     { type: 'admin', name: 'James Chen' },
   ];
   const ACTION_WEIGHTS = [
     { action: 'complete', weight: 60 },
     { action: 'undo', weight: 15 },
     { action: 'waive', weight: 10 },
     { action: 'completeOptional', weight: 10 },
     { action: 'undoOptional', weight: 5 },
   ];
   ```

3. **`pickWeighted(weights)` helper:** returns a random action based on weights.

4. **`pickRandomActor()` helper:** returns random actor from ACTORS array, or with 20% chance returns `{ type: 'student', name: null }` (student name filled in later from the selected student).

5. **`tick(db)` async function** — the core loop body:
   - Pick a random student: `SELECT id, display_name, term_id FROM students ORDER BY RANDOM() LIMIT 1`
   - If no student found, return silently
   - Get steps for that student's term: `SELECT id, title, is_optional, sort_order FROM steps WHERE term_id = $1 AND is_active = 1 ORDER BY sort_order`
   - Get student's current progress: `SELECT step_id, status FROM student_progress WHERE student_id = $1`
   - Build a map of completed step IDs
   - Pick an action using `pickWeighted`
   - Based on action:

     **`complete`:** Find the first required step not in progress map. If none, skip. Determine `completedBy`: if actor.type is `'integration'` use `'integration'`, otherwise `'manual'`. Call `applyStudentProgressChange(db, { studentId, stepId, status: 'completed', completedBy })`. If `result !== 'noop'`, call `logAudit()` with action `actor.type === 'integration' ? 'integration_complete' : 'complete'`.

     **`undo`:** Find a required step that IS in progress map with status `completed`. Pick the last one (highest sort_order). `completedBy`: same mapping as above. Call `applyStudentProgressChange` with `status: 'not_completed'`. If not noop, log `actor.type === 'integration' ? 'integration_uncomplete' : 'uncomplete'`.

     **`waive`:** Find a required step not in progress map. `completedBy`: same mapping. Call with `status: 'waived'`. If not noop, log `actor.type === 'integration' ? 'integration_waive' : 'waive'`.

     **`completeOptional`:** Find an optional step not in progress map. Force actor to student (use `{ type: 'student', name: student.display_name }`). `completedBy: 'manual'`. Call with `status: 'completed'`. If not noop, log `student_optional_complete`.

     **`undoOptional`:** Find an optional step in progress map with `completed`. Force actor to student. `completedBy: 'manual'`. Call with `status: 'not_completed'`. If not noop, log `student_optional_uncomplete`.

   - For `logAudit`, create a mock req: `{ integrationClient: actor.type === 'integration' ? { name: actor.name } : null, adminUser: actor.type === 'admin' ? { displayName: actor.name } : null, studentUser: actor.type === 'student' ? { displayName: student.display_name } : null }`
   - Log to console: `[simulator] ${actionVerb} "${stepTitle}" for ${student.display_name}`

6. **`startSimulator(db)` exported function:**
   ```javascript
   export function startSimulator(db) {
     console.log('[simulator] Started — activity every 30-60s (set DISABLE_SIMULATOR=1 to stop)');
     const scheduleNext = () => {
       const delay = MIN_INTERVAL + Math.floor(Math.random() * (MAX_INTERVAL - MIN_INTERVAL));
       setTimeout(async () => {
         try {
           await tick(db);
         } catch (err) {
           console.error('[simulator] Error:', err.message);
         }
         scheduleNext();
       }, delay);
     };
     scheduleNext();
   }
   ```

- [ ] **Step 2: Commit**

```bash
git add server/utils/simulator.js
git commit -m "feat: add live activity simulator for dev mode"
```

---

### Task 6: Wire simulator into server startup

**Files:**
- Modify: `server/index.js` (after line 108, inside `startServer()` after `app.listen`)

- [ ] **Step 1: Add simulator startup to `server/index.js`**

After the `app.listen` callback (after line 108 — `console.log(...running on port...)`), add:

```javascript
      // Start live activity simulator in dev mode
      if (process.env.NODE_ENV !== 'production' && !process.env.DISABLE_SIMULATOR) {
        import('./utils/simulator.js').then(({ startSimulator }) => startSimulator(db));
      }
```

This goes inside the `app.listen` callback so the simulator only starts after the server is ready.

- [ ] **Step 2: Test the full flow**

```bash
cd /Users/aburt1/Desktop/roadmap/CSUB-admissions
# Seed the data
node server/db/seed.js --clean --force
# Start the dev server
npm run dev
```

Expected:
1. Seed script outputs counts for students, progress, audit entries
2. Server starts and logs: `[simulator] Started — activity every 30-60s`
3. Within 30-60 seconds, console shows: `[simulator] Completed "..." for ...`
4. Admin UI shows 1,234+ students, populated analytics, audit log entries
5. Refreshing admin pages shows changing numbers over time

- [ ] **Step 3: Test simulator disable**

```bash
DISABLE_SIMULATOR=1 npm run dev:server
```

Expected: Server starts without `[simulator] Started` message. No periodic activity.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: wire simulator into dev server startup"
```

---

### Task 7: Verification and final commit

- [ ] **Step 1: Run seed with clean slate**

```bash
node server/db/seed.js --clean --force
```

Verify output shows all three counts (students, progress, audit).

- [ ] **Step 2: Start dev server and verify all admin pages**

```bash
npm run dev
```

Check in browser:
1. **Students tab** — 1,234+ students, pagination working, search works, sort works, overdue filter shows results
2. **Analytics tab** — all charts populated with meaningful data, completion distribution shows even spread
3. **Audit Log tab** — thousands of entries, filters work (by entity, action, changed_by), dates span weeks
4. **Summary stats** — total students, avg completion, active steps all reflect real data

- [ ] **Step 3: Wait 60 seconds and verify simulator**

After ~60 seconds, check:
1. Console shows at least one `[simulator]` message
2. Refreshing Audit Log shows new entry at the top
3. Student completion counts may have changed

- [ ] **Step 4: Final commit if any tweaks were needed**

```bash
git add -A
git commit -m "feat: seed data and simulator — 1,234 students, audit history, live activity"
```

- [ ] **Step 5: Push all commits**

```bash
git push
```
