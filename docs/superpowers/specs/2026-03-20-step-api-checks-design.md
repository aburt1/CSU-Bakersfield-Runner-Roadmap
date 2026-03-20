# Step API Checks — Design Spec

## Goal

Allow admins to configure per-step outbound API checks that automatically mark admissions steps as complete or incomplete based on external system data, triggered when a student loads their roadmap.

## Architecture

A new `step_api_checks` table stores per-step API configuration (URL, auth, response field path). When a student loads their roadmap, the server runs enabled checks sequentially in step order, applying results via the existing `applyStudentProgressChange()` utility. The frontend polls for updates and merges them progressively — steps visually resolve top-to-bottom with no loading spinners.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data model | Separate `step_api_checks` table (1:1 with steps) | Clean separation of concerns, credentials isolated from step data |
| Step completion logic | Simple boolean — truthy = completed, falsy = not_completed | Keep v1 simple; condition-based matching deferred |
| Student identifier | Configurable per integration, defaults to student ID | Flexibility without complexity |
| Trigger | On student roadmap load only | Schedule-based deferred to v2 |
| Execution order | Sequential in step `sort_order` | Better UX — steps resolve top-to-bottom |
| Frontend update | Background check + polling | Roadmap loads instantly, updates stream in |
| Admin UI | Inline "API Check" section on step edit form | No separate integrations page needed for v1 |
| Admin access | `requireRole('sysadmin')` middleware | Credentials and API config are sensitive |

---

## Database Schema

### New table: `step_api_checks`

```sql
CREATE TABLE step_api_checks (
  id SERIAL PRIMARY KEY,
  step_id INTEGER NOT NULL UNIQUE REFERENCES steps(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  http_method VARCHAR(10) DEFAULT 'GET',
  url TEXT NOT NULL,
  auth_type VARCHAR(20) DEFAULT 'none',       -- 'none', 'basic', 'bearer'
  auth_credentials TEXT,                       -- Encrypted JSON: {username, password} or {token}
  headers TEXT,                                -- JSON: [{key, value}]
  student_param_name VARCHAR(100) DEFAULT 'studentId',
  student_param_source VARCHAR(50) DEFAULT 'emplid',  -- 'emplid' (campus student ID) or 'email'
  response_field_path VARCHAR(255) NOT NULL,   -- dot-notation, e.g. "data.fafsa_complete"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Notes:**
- `UNIQUE` on `step_id` enforces 1:1 relationship
- `ON DELETE CASCADE` cleans up when a step is deleted
- `auth_credentials` encrypted with AES before storage, decrypted only at execution time
- `student_param_source` determines which student field is substituted into the URL placeholder: `'emplid'` resolves to `students.emplid` (the campus-assigned student ID number, e.g., `001001000`), `'email'` resolves to `students.email`

### Schema change: `students`

Add column to throttle checks:

```sql
ALTER TABLE students ADD COLUMN last_api_check_at TIMESTAMPTZ;
```

This lives on the `students` table (not `student_progress`) so it works for students with zero progress rows. Checked per-student — if `last_api_check_at` is within 5 minutes, skip re-running checks.

### Schema change: `student_progress`

Add column to track how a step was completed:

```sql
ALTER TABLE student_progress ADD COLUMN completed_by VARCHAR(20) DEFAULT 'manual';
-- Values: 'manual', 'api_check', 'integration'
```

API check execution only reverts a step to `not_completed` if `completed_by = 'api_check'`. This prevents overriding manual completions or completions from the inbound integration system.

---

## Server-Side Execution Flow

### Trigger: Student loads roadmap

1. `GET /api/roadmap/:email` returns immediately with current cached state
2. Frontend calls `POST /api/roadmap/:email/run-api-checks` after mount
3. Server checks throttle (`last_api_check_at` within 5 minutes → return `{ status: "skipped" }`)
4. Server fetches all enabled `step_api_checks` joined with `steps`, ordered by `steps.sort_order`
5. For each check, sequentially:
   a. Build the request URL, substituting `{{studentId}}` (or configured placeholder) with the student's ID/email
   b. Set authentication headers based on `auth_type`
   c. Make HTTP request with **5-second timeout**
   d. Parse JSON response, extract value at `response_field_path` using dot-notation
   e. If truthy and step not already completed → `applyStudentProgressChange(db, { studentId, stepId, status: 'completed', completedBy: 'api_check' })`
   f. If falsy and step currently completed AND `completed_by = 'api_check'` → `applyStudentProgressChange(db, { studentId, stepId, status: 'not_completed', completedBy: 'api_check' })`
   g. If response path doesn't exist or intermediate is null → treat as falsy (log warning, do not error)
   h. Record the result for the polling endpoint (store in server-side `Map` keyed by `studentEmail`)
6. Update `students.last_api_check_at` for the student
7. Mark check run as `complete` in the in-memory run state

### `applyStudentProgressChange()` extension

Add an optional `completedBy` property to the existing options object (the function uses `applyStudentProgressChange(db, { studentId, stepId, status, ... })`). The new property defaults to `'manual'` if omitted, preserving backward compatibility. Existing callers in `integrations.js` should pass `completedBy: 'integration'`.

### Run state storage

Background check runs store their state in a server-side `Map<studentEmail, { status, checkedSteps, startedAt }>`. Entries are automatically cleaned up after 2 minutes. This is adequate for v1 single-process deployment. For multi-process deployments (v2), this would need to move to Redis or the database.

### Safeguards

- **5-second timeout** per external API call
- **15-second total cap** — if not all checks done, mark run as complete with partial results. Steps not reached are simply not included in `checkedSteps`; the frontend treats absence as "no change"
- **5-minute throttle** — checked via `students.last_api_check_at`, prevents re-running on rapid page refreshes
- **Failures are silent** — logged server-side, student never sees errors
- **No step regression for non-API completions** — only revert to `not_completed` if `completed_by = 'api_check'`
- **Missing response paths** — if `response_field_path` doesn't exist in the JSON response or traverses through null, treat as falsy (not an error)

---

## API Routes

### Student-facing

**`POST /api/roadmap/:email/run-api-checks`**
- Auth: Authenticated student session with **ownership check** — server verifies `req.studentEmail === req.params.email`, returns 403 if mismatch
- Throttle: Skips if `students.last_api_check_at` within 5 minutes
- Behavior: Spawns sequential check execution in background, returns immediately
- Response: `{ status: "started" | "skipped" }`

**`GET /api/roadmap/:email/check-status`**
- Auth: Authenticated student session with **ownership check** (same as above)
- Response:
  ```json
  {
    "status": "running" | "complete" | "no_run",
    "checkedSteps": [
      { "stepId": 3, "newStatus": "completed" },
      { "stepId": 5, "newStatus": "not_completed" }
    ]
  }
  ```

### Admin-facing (`requireRole('sysadmin')` on all routes below)

**`GET /api/admin/steps/:id/api-check`**
- Returns API check config for a step
- Credentials are masked in response (`••••••••`)

**`PUT /api/admin/steps/:id/api-check`**
- Creates or updates API check config
- Encrypts credentials before storing
- Validates URL format, required fields

**`DELETE /api/admin/steps/:id/api-check`**
- Removes API check config for a step

**`POST /api/admin/steps/:id/api-check/test`**
- Body: `{ testStudentId: "123456" }`
- Runs the configured API check with the test ID
- Returns: `{ statusCode, responseBody, extractedValue, wouldMarkComplete }`

---

## Admin UI

### Location

Collapsible **"API Check"** section on the step edit form, below existing fields. Only rendered when the logged-in admin has `role === 'sysadmin'` (checked from the JWT/auth context).

### Fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Enable API Check | Toggle | Off | Master switch |
| HTTP Method | Dropdown | GET | GET, POST |
| URL | Text input | — | Supports `{{studentId}}` placeholder |
| Authentication Type | Dropdown | None | None, Basic, Bearer |
| Username | Text (conditional) | — | Shown when auth = Basic |
| Password | Password (conditional) | — | Shown when auth = Basic, masked |
| Bearer Token | Password (conditional) | — | Shown when auth = Bearer, masked |
| Custom Headers | Key/Value rows | — | Add/remove rows |
| Student Parameter Source | Dropdown | Campus ID (emplid) | Campus ID (emplid), Email |
| Response Field Path | Text input | — | Dot-notation (e.g., `data.is_complete`) |

### Test functionality

- "Test API" button at the bottom of the section
- Prompts for a test student ID
- Shows: HTTP status, raw response (truncated), extracted value, and whether it would mark the step complete

---

## Frontend Check Flow

1. `RoadmapPage` mounts → fetches roadmap as normal → renders immediately
2. After initial render, calls `POST /api/roadmap/:email/run-api-checks`
3. If response is `started`, begins polling `GET /api/roadmap/:email/check-status` every 2 seconds
4. Each poll response's `checkedSteps` are merged into local state — steps update visually
5. When `status === "complete"`, stop polling
6. If polling fails or exceeds 30 seconds, stop silently

**No loading indicators on individual steps** — updates are subtle and non-disruptive.

---

## Security

- **Credential encryption**: `auth_credentials` encrypted with AES-256-GCM using a server-side encryption key (env var `API_CHECK_ENCRYPTION_KEY`). Key must be exactly 32 bytes (64 hex chars). Server must refuse to start if the env var is missing or wrong length. No key rotation mechanism in v1 — if the key changes, stored credentials must be re-entered.
- **Admin access**: API check config endpoints require `requireRole('sysadmin')`
- **Credential masking**: GET endpoint never returns raw credentials
- **Student isolation**: Students can only trigger checks for their own roadmap — ownership enforced by comparing `req.studentEmail` to `:email` path param, returning 403 on mismatch
- **Timeout protection**: 5s per call, 15s total cap
- **No credential exposure**: External API credentials never sent to the frontend
- **SSRF mitigation**: The test endpoint and execution runner must reject URLs targeting private/internal IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`) and non-HTTP(S) schemes. Log rejected attempts.

---

## Files to Create/Modify

### New files
- `server/utils/apiCheckRunner.js` — Core execution logic (build request, call API, extract response, apply result)
- `server/utils/encryption.js` — AES encrypt/decrypt utility for credentials
- `server/routes/apiChecks.js` — Admin CRUD routes for step API check config
- `server/routes/studentApiChecks.js` — Student-facing run/poll routes
- `client/src/components/admin/ApiCheckConfig.jsx` — Admin UI component for the API check section

### Modified files
- `server/db/init.js` — Add `step_api_checks` table, add `last_api_check_at` to `students`, add `completed_by` to `student_progress`
- `server/utils/progress.js` — Extend `applyStudentProgressChange()` with optional `completedBy` parameter
- `server/routes/integrations.js` — Pass `'integration'` as `completedBy` to existing calls
- `server/index.js` — Mount new route files
- `client/src/pages/RoadmapPage.jsx` — Add check trigger + polling logic after mount
- `client/src/pages/AdminPage.jsx` — Import and render `ApiCheckConfig` for system admins

---

## Out of Scope (v2)

- Scheduled/cron-based API checks
- Multiple outputs per integration (one API call → multiple steps)
- Condition-based matching (equals, greater than, contains)
- OAuth authentication
- Retry logic for failed API calls
- Webhook-based triggers (external system pushes updates)
- Integration audit log UI
