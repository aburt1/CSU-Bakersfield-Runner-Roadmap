# CSUB Admissions API Integration Guide

This guide covers how external systems integrate with the CSUB Admissions app. There are two integration patterns:

| | Inbound (Push) | Outbound (Poll) |
|---|---|---|
| **Direction** | External system calls *our* API | Our app calls *your* API |
| **Use case** | PeopleSoft marks a step complete after processing | App checks if a student submitted a form on an external portal |
| **Who initiates** | Your system | Our app (triggered by the student) |
| **Auth method** | Integration key | Configured per-step by a sysadmin (none, basic, or bearer) |

**Base URL:** `https://your-domain.com` (substitute your production hostname)

---

## Table of Contents

1. [Authentication & Security](#authentication--security)
2. [Inbound Integration (Push Data In)](#inbound-integration-push-data-in)
3. [Outbound Integration (Poll External APIs)](#outbound-integration-poll-external-apis)
4. [Environment Variables](#environment-variables)
5. [Error Code Reference](#error-code-reference)

---

## Authentication & Security

The app uses three separate authentication models depending on the audience.

### Integration Key (for inbound API)

Integration clients are provisioned with a secret key. The raw key is never stored — only a bcrypt hash is kept in the database.

Send your key in one of two ways:

```
X-Integration-Key: your-secret-key
```

or

```
Authorization: Bearer your-secret-key
```

**Key provisioning:** Keys are created during database initialization via environment variables (see [Environment Variables](#environment-variables)) or by inserting directly into the `integration_clients` table. Each client has a `name`, `key_hash`, and `is_active` flag.

**Rotating keys:** Create a new integration client, update your systems to use the new key, then deactivate the old client by setting `is_active = 0`.

### Admin JWT (for API check configuration)

Admin endpoints require a JWT obtained from `POST /api/admin/auth/login`. The token is sent as:

```
Authorization: Bearer <admin-jwt>
```

Admin roles control access:

| Role | Access |
|------|--------|
| `viewer` | Read-only access to admin dashboards |
| `admissions` | Can mark steps complete/incomplete for students |
| `admissions_editor` | Can create/edit steps and terms |
| `sysadmin` | Full access including API check configuration and user management |

### Rate Limiting

All `/api/` routes are rate-limited to **200 requests per 15 minutes** per IP address. Standard rate-limit headers are returned:

- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`

### Credential Encryption

Outbound API check credentials (basic auth passwords, bearer tokens) are encrypted at rest using **AES-256-GCM**. The encryption key is configured via the `API_CHECK_ENCRYPTION_KEY` environment variable.

### SSRF Protection

Outbound API check URLs are validated before requests are made. In production, the following are blocked:

- Private IPv4 ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- Private IPv6 (::1, fc/fd prefixes)
- localhost
- Non-HTTP(S) schemes

In development, localhost and private IPs are allowed for testing with mock APIs.

---

## Inbound Integration (Push Data In)

External systems (e.g., PeopleSoft) call these endpoints to update student step completion status. All endpoints require an integration key.

### Quick Start

1. **Get your integration key** from the server admin
2. **Discover available steps** by calling `GET /api/integrations/v1/step-catalog`
3. **Send completions** via `PUT /api/integrations/v1/step-completions` (single) or `POST /api/integrations/v1/step-completions/batch` (bulk)
4. **Always include a `source_event_id`** for idempotency — safe retries on network failures

### Key Concepts

- **Students** are identified by `student_id_number` (the emplid field — e.g., the PeopleSoft employee/student ID)
- **Steps** are identified by `step_key` (a unique string per term — e.g., `submit-application`, `pay-deposit`)
- **Status** must be one of: `completed`, `waived`, `not_completed`

---

### GET /api/integrations/v1/step-catalog

Discover the available steps and their `step_key` values. Call this first to know which keys to use.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `term_id` | integer | No | Filter to a specific term. If omitted, returns all terms. |

**Example Request:**

```bash
curl -H "X-Integration-Key: your-secret-key" \
  "https://your-domain.com/api/integrations/v1/step-catalog?term_id=1"
```

**Response (200):**

```json
[
  {
    "term_id": 1,
    "term_name": "Fall 2026",
    "step_key": "submit-application",
    "title": "Submit Application",
    "is_active": 1
  },
  {
    "term_id": 1,
    "term_name": "Fall 2026",
    "step_key": "pay-deposit",
    "title": "Pay Enrollment Deposit",
    "is_active": 1
  }
]
```

> **Note:** Only send completions for steps where `is_active` is `1`. Inactive steps will return a `step_inactive` error.

---

### PUT /api/integrations/v1/step-completions

Update a single student's step completion status.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `student_id_number` | string | Yes | The student's emplid (e.g., `"000123456"`) |
| `step_key` | string | Yes | The step to update (e.g., `"submit-application"`) |
| `status` | string | Yes | `"completed"`, `"waived"`, or `"not_completed"` |
| `source_event_id` | string | Yes | Unique ID for idempotency (see [Idempotency](#idempotency)) |
| `note` | string | No | Optional note attached to the completion |
| `completed_at` | string | No | ISO 8601 timestamp. Defaults to current time if omitted. |

**Example Request:**

```bash
curl -X PUT \
  -H "X-Integration-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id_number": "000123456",
    "step_key": "submit-application",
    "status": "completed",
    "source_event_id": "PS-TXN-2026-03-22-001",
    "note": "Application received via PeopleSoft"
  }' \
  "https://your-domain.com/api/integrations/v1/step-completions"
```

**Success Response (200):**

```json
{
  "success": true,
  "student_id_number": "000123456",
  "step_key": "submit-application",
  "student_id": "a1b2c3d4-uuid",
  "step_id": 5,
  "status": "completed",
  "result": "created",
  "completed_at": "2026-03-22T18:30:00.000Z",
  "source_event_id": "PS-TXN-2026-03-22-001"
}
```

**Result Values:**

| Result | Meaning |
|--------|---------|
| `created` | New completion record was created |
| `updated` | Existing record was changed (e.g., status or note updated) |
| `noop` | Already in the requested state — no changes made |

**Error Response (4xx):**

```json
{
  "success": false,
  "student_id_number": "000123456",
  "step_key": "submit-application",
  "status": "completed",
  "source_event_id": "PS-TXN-2026-03-22-001",
  "result": "failed",
  "error": "Student not found",
  "code": "student_not_found"
}
```

---

### POST /api/integrations/v1/step-completions/batch

Update multiple students/steps in a single request. Each item has the same fields as the single endpoint.

**Request Body:**

```json
{
  "items": [
    {
      "student_id_number": "000123456",
      "step_key": "submit-application",
      "status": "completed",
      "source_event_id": "PS-BATCH-001-A"
    },
    {
      "student_id_number": "000789012",
      "step_key": "pay-deposit",
      "status": "waived",
      "source_event_id": "PS-BATCH-001-B",
      "note": "Fee waiver approved"
    }
  ]
}
```

**Example Request:**

```bash
curl -X POST \
  -H "X-Integration-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"items": [...]}' \
  "https://your-domain.com/api/integrations/v1/step-completions/batch"
```

**Response (200):**

```json
{
  "success": true,
  "items": [
    {
      "success": true,
      "student_id_number": "000123456",
      "step_key": "submit-application",
      "student_id": "a1b2c3d4-uuid",
      "step_id": 5,
      "status": "completed",
      "result": "created",
      "completed_at": "2026-03-22T18:30:00.000Z",
      "source_event_id": "PS-BATCH-001-A"
    },
    {
      "success": true,
      "student_id_number": "000789012",
      "step_key": "pay-deposit",
      "student_id": "e5f6g7h8-uuid",
      "step_id": 8,
      "status": "waived",
      "result": "created",
      "completed_at": "2026-03-22T18:30:00.000Z",
      "source_event_id": "PS-BATCH-001-B"
    }
  ],
  "summary": {
    "total": 2,
    "succeeded": 2,
    "failed": 0
  }
}
```

> **Important:** The batch endpoint always returns HTTP 200 at the envelope level, even if individual items fail. Always check each item's `success` field. Items are processed sequentially in array order. Each item is independently idempotent via its own `source_event_id`.

---

### Idempotency

Every request **must** include a `source_event_id`. This is the key to safe retries.

**How it works:**

1. The first time a `(client, source_event_id)` pair is seen, the request is processed normally and the full response is stored in the `integration_events` table.
2. If the same pair is sent again, the stored response is returned immediately — no re-processing occurs.
3. A different `source_event_id` is always treated as a new request.

**Choosing good source_event_id values:**

- Use your source system's transaction ID (e.g., PeopleSoft transaction number)
- Or build a deterministic composite: `{emplid}-{step_key}-{timestamp}`
- Must be unique per integration client — do not reuse across different logical operations

| Scenario | Behavior |
|----------|----------|
| First call with event ID `ABC-123` | Processes request, stores response |
| Retry with same event ID `ABC-123` | Returns stored response (no re-processing) |
| New call with event ID `ABC-456` | Processes as a new request |

---

## Outbound Integration (Poll External APIs)

The app can poll external HTTP endpoints to automatically check whether a student has completed a step. A sysadmin configures a URL template and response field path per step. When a student triggers a check, the app calls each configured URL, extracts a boolean value, and updates the step accordingly.

### How It Works

1. A sysadmin configures an API check on a step (URL, auth, response field path)
2. A student visits their roadmap and triggers a check run
3. The app iterates through all enabled checks for the student's term
4. For each check, it substitutes the student's identifier into the URL, calls the external API, and extracts the configured field
5. **Truthy value** = mark step completed (as `api_check`)
6. **Falsy value** = revert to incomplete, **but only if** the step was previously auto-completed by `api_check` (never reverts manual or integration completions)

**Throttling & Timeouts:**

- **5-minute cooldown** per student between check runs
- **5-second timeout** per individual external API call
- **15-second total cap** across all checks in a single run

---

### What Your External Endpoint Must Provide

If you are building an API that the admissions app will poll, here is what it needs:

1. **Accept an HTTP GET or POST** request
2. **Accept a student identifier** in the URL (substituted via a placeholder)
3. **Return JSON** with a field that evaluates to truthy (step complete) or falsy (step incomplete)

**Simple example:**

URL configured as: `https://api.example.com/housing/check/{{studentId}}`

Your endpoint returns:

```json
{
  "completed": true
}
```

The `response_field_path` would be set to `completed`.

**Nested example:**

URL: `https://api.example.com/students/{{emplid}}/admissions`

Your endpoint returns:

```json
{
  "data": {
    "admissions": {
      "depositPaid": true
    }
  }
}
```

The `response_field_path` would be `data.admissions.depositPaid`.

**URL Placeholders:**

The placeholder name defaults to `studentId` but can be customized via `student_param_name`. At runtime, the placeholder is replaced with the student's emplid (default) or internal ID, depending on `student_param_source`. The value is URI-encoded.

| `student_param_source` | What gets substituted |
|------------------------|----------------------|
| `emplid` (default) | The student's employee/student ID number |
| `email` | The student's email address |

**Auth Options:**

| `auth_type` | `auth_credentials` format | Header sent |
|-------------|---------------------------|-------------|
| `none` | N/A | None |
| `basic` | `{"username": "user", "password": "pass"}` | `Authorization: Basic <base64>` |
| `bearer` | `{"token": "your-token"}` | `Authorization: Bearer your-token` |

Custom headers can also be configured as an array of `{"key": "X-Custom", "value": "value"}` objects.

---

### Admin Configuration Endpoints

These endpoints require admin JWT with the **sysadmin** role.

#### GET /api/admin/steps/:id/api-check

Get the current API check configuration for a step. Credentials are masked in the response.

```bash
curl -H "Authorization: Bearer <admin-jwt>" \
  "https://your-domain.com/api/admin/steps/5/api-check"
```

**Response (configured):**

```json
{
  "configured": true,
  "id": 1,
  "step_id": 5,
  "is_enabled": true,
  "http_method": "GET",
  "url": "https://api.example.com/check/{{studentId}}",
  "auth_type": "bearer",
  "auth_credentials": "••••••••",
  "headers": [{"key": "X-Campus", "value": "CSUB"}],
  "student_param_name": "studentId",
  "student_param_source": "emplid",
  "response_field_path": "completed"
}
```

**Response (not configured):**

```json
{
  "configured": false
}
```

#### PUT /api/admin/steps/:id/api-check

Create or update an API check configuration.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | URL with `{{placeholder}}` for student ID |
| `response_field_path` | string | Yes | Dot-notation path to the boolean field in the response |
| `http_method` | string | No | `"GET"` (default) or `"POST"` |
| `auth_type` | string | No | `"none"` (default), `"basic"`, or `"bearer"` |
| `auth_credentials` | object | No | See auth options table above. Encrypted at rest. |
| `headers` | array | No | Array of `{"key": "...", "value": "..."}` objects |
| `student_param_name` | string | No | Placeholder name in URL (default: `"studentId"`) |
| `student_param_source` | string | No | `"emplid"` (default) or `"email"` |
| `is_enabled` | boolean | No | Default: `true` |

```bash
curl -X PUT \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/check/{{studentId}}",
    "response_field_path": "completed",
    "http_method": "GET",
    "auth_type": "bearer",
    "auth_credentials": {"token": "secret-api-token"},
    "student_param_name": "studentId",
    "student_param_source": "emplid",
    "is_enabled": true
  }' \
  "https://your-domain.com/api/admin/steps/5/api-check"
```

**Response:** `{"success": true}`

#### DELETE /api/admin/steps/:id/api-check

Remove the API check configuration for a step.

```bash
curl -X DELETE \
  -H "Authorization: Bearer <admin-jwt>" \
  "https://your-domain.com/api/admin/steps/5/api-check"
```

**Response:** `{"success": true}`

#### POST /api/admin/steps/:id/api-check/test

Test an API check with a sample student identifier before going live.

```bash
curl -X POST \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"testStudentId": "000123456"}' \
  "https://your-domain.com/api/admin/steps/5/api-check/test"
```

**Response:**

```json
{
  "statusCode": 200,
  "responseBody": "{\"completed\": true}",
  "extractedValue": true,
  "wouldMarkComplete": true
}
```

Use `wouldMarkComplete` to verify the configuration is working as expected before enabling.

---

### Student-Facing Trigger

These endpoints require a student JWT.

#### POST /api/roadmap/run-api-checks

Trigger a background check run. Returns immediately.

```bash
curl -X POST \
  -H "Authorization: Bearer <student-jwt>" \
  "https://your-domain.com/api/roadmap/run-api-checks"
```

**Responses:**

- `{"status": "started"}` — checks are running in the background
- `{"status": "skipped"}` — within 5-minute cooldown, try again later

#### GET /api/roadmap/check-status

Poll for the result of the most recent check run.

```bash
curl -H "Authorization: Bearer <student-jwt>" \
  "https://your-domain.com/api/roadmap/check-status"
```

**Response:**

```json
{
  "status": "complete",
  "checkedSteps": [
    {"stepId": 5, "newStatus": "completed"},
    {"stepId": 8, "newStatus": "not_completed"}
  ]
}
```

Status values: `"running"`, `"complete"`, `"no_run"` (no recent run).

**Polling pattern (JavaScript):**

```javascript
async function runAndPoll(token) {
  await fetch('/api/roadmap/run-api-checks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch('/api/roadmap/check-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.status === 'complete') return data.checkedSteps;
  }
}
```

---

## Environment Variables

These environment variables are required for integration features.

| Variable | Required For | Description |
|----------|-------------|-------------|
| `INTEGRATION_DEFAULT_NAME` | Inbound | Name of the default integration client seeded on startup (e.g., `"PeopleSoft"`) |
| `INTEGRATION_DEFAULT_KEY` | Inbound | Raw secret key for the default client (bcrypt-hashed before storage) |
| `API_CHECK_ENCRYPTION_KEY` | Outbound | 64-character hex string (32 bytes) for AES-256-GCM encryption of stored credentials |
| `NODE_ENV` | Both | Set to `"production"` to enable SSRF protection on outbound checks |

**Generate an encryption key:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Error Code Reference

### Inbound Integration API Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_source_event_id` | 400 | `source_event_id` is missing or empty |
| `invalid_status` | 400 | `status` is not `completed`, `waived`, or `not_completed` |
| `invalid_student_id_number` | 400 | `student_id_number` is missing or empty |
| `invalid_step_key` | 400 | `step_key` is missing or empty |
| `invalid_completed_at` | 400 | `completed_at` is not a valid ISO timestamp |
| `student_not_found` | 404 | No student found with the given emplid |
| `step_not_found` | 404 | No step found with the given `step_key` in the student's term |
| `student_term_missing` | 409 | Student does not have an assigned term |
| `step_inactive` | 409 | The step exists but is deactivated |
| `duplicate_student_id_number` | 409 | Multiple students share the same emplid (data integrity issue) |

### Authentication Errors

| HTTP Status | Response | Cause |
|-------------|----------|-------|
| 401 | `{"error": "Integration authentication required"}` | No key provided |
| 401 | `{"error": "Invalid integration credentials"}` | Key does not match any active client |

### Admin API Check Configuration Errors

| HTTP Status | Response | Cause |
|-------------|----------|-------|
| 400 | `url and response_field_path are required` | Missing required fields |
| 400 | `Invalid URL format` | URL is malformed (even after placeholder substitution) |
| 400 | `http_method must be GET or POST` | Unsupported HTTP method |
| 400 | `auth_type must be none, basic, or bearer` | Unsupported auth type |
| 404 | `No API check configured for this step` | Test endpoint called on unconfigured step |
| 500 | `Encryption key not configured on server` | `API_CHECK_ENCRYPTION_KEY` env var missing/invalid |
