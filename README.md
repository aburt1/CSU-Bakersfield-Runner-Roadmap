# CSUB Admissions Guide — Road to Becoming a Roadrunner

An interactive, road-themed student onboarding application for California State University, Bakersfield. Guides newly admitted students through every step of the admissions process — from acceptance to their first day of classes.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r160-000000?logo=three.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)

---

## Screenshots

### Public Landing Page
The pre-login view shows the admissions checklist and lets prospective students preview the steps ahead.

<img src="docs/screenshots/public-preview.png" alt="Public landing page" width="720" />

### Student Dashboard
Once logged in, students see their personalized progress, upcoming deadlines, and next steps.

<img src="docs/screenshots/student-dashboard.png" alt="Student dashboard with progress tracking" width="720" />

### Admin Dashboard
Admissions staff manage students, steps, analytics, audit logs, terms, and user roles from a tabbed admin panel.

<img src="docs/screenshots/admin-dashboard.png" alt="Admin dashboard" width="720" />

---

## Features

- **Interactive admissions roadmap** — Step-by-step checklist that tracks student progress from acceptance through enrollment
- **3D road visualization** — Three.js-powered road scene with signposts, trees, and progress-based coloring
- **Admin dashboard** — Manage students, steps, analytics, audit logs, academic terms, and admin users
- **Integration API** — REST API for external systems (SIS, ERP, etc.) to sync step completions via stable keys with idempotent batch support
- **Tag-based step filtering** — Show steps conditionally based on student tags (first-gen, transfer, veteran, honors, athlete, EOP, out-of-state)
- **Optional self-service steps** — Students can mark optional steps as complete or incomplete on their own
- **WYSIWYG rich text editor** — Tiptap-based editor for formatting step instructions with inline links
- **Drag-and-drop reordering** — Reorder admissions steps with a grip handle (Framer Motion)
- **Role-based access control** — Four-tier RBAC: viewer, admissions, admissions_editor, sysadmin
- **Multi-term support** — Manage separate cohorts (Fall 2026, Spring 2027, etc.)
- **Server-side pagination** — Sortable, filterable student lists with overdue deadline detection
- **Audit logging** — Full history of admin and integration actions for accountability
- **CSV export** — Export student progress data for reporting
- **Responsive design** — Works on desktop and mobile
- **Accessibility** — High-contrast mode, keyboard navigation, skip-to-content links, ARIA labels
- **Public preview mode** — Selected steps visible before login for prospective students

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite 6, Tailwind CSS 3, Three.js, Framer Motion, Recharts, Tiptap, DOMPurify |
| **Backend** | Node.js, Express 4, better-sqlite3 (SQLite WAL mode), JWT authentication |
| **Auth** | SSO integration ready, JWT sessions, bcrypt password hashing |
| **Security** | Helmet, CORS, express-rate-limit |
| **Deployment** | Containerized single-process server (serves API + static frontend) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/CSUB-admissions.git
cd CSUB-admissions

# Install all dependencies (root, client, and server)
npm install

# Start both dev servers (client on :3000, server on :3001)
npm run dev
```

The client runs at [http://localhost:3000](http://localhost:3000) and proxies API requests to the server at port 3001.

### Default Credentials

The database seeds automatically on first run with sample data:

| Account | Email | Password |
|---------|-------|----------|
| Admin (sysadmin) | `admin@csub.edu` | `admin123` |
| Sample students | `marcot@csub.edu`, etc. | Dev login (name + email) |

> **Note:** Change the default admin password and JWT secret before deploying to production.

---

## Integration API

> **Full API documentation:** See the [API Integration Guide](docs/API-GUIDE.md) for detailed endpoint references, request/response examples, authentication setup, error codes, and outbound polling configuration.

The integration API allows external systems — such as a student information system, enrollment platform, or workflow engine — to push step-completion data into the application. This is the recommended way to keep student progress in sync across systems.

All integration endpoints require an API key passed as either:

- **Header:** `x-integration-key: <key>`
- **Bearer token:** `Authorization: Bearer <key>`

A dev integration key is seeded automatically on first run (see Environment Variables).

### Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/integrations/v1/step-catalog` | List available step keys (optionally filtered by term) |
| `PUT` | `/api/integrations/v1/step-completions` | Update one student's step status |
| `POST` | `/api/integrations/v1/step-completions/batch` | Batch update multiple students' step statuses |

### Discover Step Keys

External systems should resolve steps by `step_key`, not by numeric step ID. Step keys are stable identifiers that persist across reordering and editing.

```bash
curl http://localhost:3001/api/integrations/v1/step-catalog \
  -H "x-integration-key: dev-integration-key"
```

Example response:

```json
[
  {
    "term_id": 1,
    "term_name": "Fall 2026",
    "step_key": "activate-your-csub-account",
    "title": "Activate Your CSUB Account",
    "is_active": 1
  }
]
```

Filter by term:

```bash
curl "http://localhost:3001/api/integrations/v1/step-catalog?term_id=1" \
  -H "x-integration-key: dev-integration-key"
```

### Update a Student's Step Status

Use the student's **Student ID #** (`emplid`) plus the step's `step_key`.

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `student_id_number` | string | The student's ID number (emplid) |
| `step_key` | string | Stable step identifier from the step catalog |
| `status` | string | `completed`, `waived`, or `not_completed` |
| `source_event_id` | string | Unique idempotency key from the calling system |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `note` | string | Free-text note attached to the progress record |
| `completed_at` | string | ISO 8601 timestamp override (defaults to now) |

#### Mark a Step Complete

```bash
curl -X PUT http://localhost:3001/api/integrations/v1/step-completions \
  -H "Content-Type: application/json" \
  -H "x-integration-key: dev-integration-key" \
  -d '{
    "student_id_number": "001000000",
    "step_key": "activate-your-csub-account",
    "status": "completed",
    "source_event_id": "evt-1001",
    "note": "Synced from SIS"
  }'
```

#### Success Response

```json
{
  "success": true,
  "student_id_number": "001000000",
  "step_key": "activate-your-csub-account",
  "student_id": "abc-123",
  "step_id": 1,
  "status": "completed",
  "result": "created",
  "completed_at": "2026-03-19T12:00:00.000Z",
  "source_event_id": "evt-1001"
}
```

The `result` field indicates what happened:

| Value | Meaning |
|-------|---------|
| `created` | New progress record was created |
| `updated` | Existing record was changed to a different status |
| `noop` | Record already had the requested status — no change made |

#### Waive a Step

```bash
curl -X PUT http://localhost:3001/api/integrations/v1/step-completions \
  -H "Content-Type: application/json" \
  -H "x-integration-key: dev-integration-key" \
  -d '{
    "student_id_number": "001000000",
    "step_key": "activate-your-csub-account",
    "status": "waived",
    "source_event_id": "evt-1002"
  }'
```

#### Remove Completion

Use `not_completed` to clear the student's progress for that step.

```bash
curl -X PUT http://localhost:3001/api/integrations/v1/step-completions \
  -H "Content-Type: application/json" \
  -H "x-integration-key: dev-integration-key" \
  -d '{
    "student_id_number": "001000000",
    "step_key": "activate-your-csub-account",
    "status": "not_completed",
    "source_event_id": "evt-1003"
  }'
```

### Error Responses

Errors return a structured JSON body with a `code` field for programmatic handling.

#### Student Not Found (404)

```json
{
  "success": false,
  "student_id_number": "999999999",
  "step_key": "activate-your-csub-account",
  "status": "completed",
  "source_event_id": "evt-9001",
  "result": "failed",
  "error": "No student found with student_id_number 999999999",
  "code": "student_not_found"
}
```

#### Invalid Step Key (404)

```json
{
  "success": false,
  "student_id_number": "001000000",
  "step_key": "nonexistent-step",
  "status": "completed",
  "source_event_id": "evt-9002",
  "result": "failed",
  "error": "No active step found with key nonexistent-step for this student's term",
  "code": "step_not_found"
}
```

#### Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_student_id_number` | 400 | Missing or malformed student ID |
| `invalid_step_key` | 400 | Missing or malformed step key |
| `invalid_status` | 400 | Status is not `completed`, `waived`, or `not_completed` |
| `invalid_source_event_id` | 400 | Missing `source_event_id` |
| `student_not_found` | 404 | No student matches the given ID number |
| `step_not_found` | 404 | No active step matches the given key in the student's term |
| `student_term_missing` | 409 | Student does not have an assigned term |
| `step_inactive` | 409 | Step exists but is deactivated |

### Batch Updates

Use the batch endpoint for nightly syncs or bulk updates.

```bash
curl -X POST http://localhost:3001/api/integrations/v1/step-completions/batch \
  -H "Content-Type: application/json" \
  -H "x-integration-key: dev-integration-key" \
  -d '{
    "items": [
      {
        "student_id_number": "001000000",
        "step_key": "activate-your-csub-account",
        "status": "completed",
        "source_event_id": "evt-2001"
      },
      {
        "student_id_number": "001000001",
        "step_key": "activate-your-csub-account",
        "status": "waived",
        "source_event_id": "evt-2002"
      }
    ]
  }'
```

Batch response:

```json
{
  "success": true,
  "items": [ "..." ],
  "summary": {
    "total": 2,
    "succeeded": 2,
    "failed": 0
  }
}
```

Each item in the `items` array follows the same response format as the single-update endpoint, so callers can inspect individual results.

### Integration Notes

- `source_event_id` is required and used for **idempotency** — the same event can be replayed safely, and a repeated update with the same final state returns `noop`
- Students are resolved by their Student ID # (`emplid`), exposed as `student_id_number`
- Steps are resolved by `term_id + step_key`
- Integration callers cannot access admin auth or admin API routes
- All integration actions are logged in the audit trail

---

## API Overview

All API routes are prefixed with `/api/`:

| Route | Description |
|-------|-------------|
| `POST /api/auth/dev-login` | Student dev login |
| `GET /api/steps` | List active admissions steps |
| `GET /api/steps/progress` | Student progress (authenticated) |
| `PUT /api/steps/:stepId/status` | Student self-service update for optional steps (authenticated) |
| `GET /api/admin/students` | Paginated student list (admin) |
| `POST /api/admin/students/:studentId/steps/:stepId/complete` | Mark a step completed or waived (admin) |
| `DELETE /api/admin/students/:studentId/steps/:stepId/complete` | Remove a student's completion for a step (admin) |
| `PUT /api/admin/steps/reorder` | Reorder steps (editor+) |
| `GET /api/admin/analytics/*` | Charts and stats (admin) |
| `GET /api/admin/audit` | Audit log with filters (admin) |
| `GET /api/admin/export/progress` | CSV export (admin) |
| `GET /api/integrations/v1/step-catalog` | List stable step keys for integrations |
| `PUT /api/integrations/v1/step-completions` | Update one student's step status by Student ID # + step key |
| `POST /api/integrations/v1/step-completions/batch` | Batch step status updates for integrations |

---

## How A Student's Step List Works

Each student's roadmap is built from four things:

1. **Assigned term** — the student only sees steps from their current `term_id`
2. **Step visibility rules** — step tags decide whether a student qualifies to see a step
3. **Manual + derived tags** — manual tags are managed by staff, derived tags come from profile fields like applicant type and residency
4. **Progress records** — completion, waiver, or removal changes the student's status on a step

That means "updating a student's step list" can mean any of the following:

- changing the student's term
- changing the student's manual tags
- changing the step's visibility rules
- marking a step complete, waived, or not completed

---

## Project Structure

```
CSUB-admissions/
├── client/                     # React SPA (Vite)
│   ├── src/
│   │   ├── 3d/                 # Three.js road scene components
│   │   ├── auth/               # Auth context + SSO config
│   │   ├── components/         # Shared UI (Header, StepCard, roadmap/)
│   │   ├── hooks/              # useProgress custom hook
│   │   └── pages/
│   │       ├── RoadmapPage.jsx # Main student view
│   │       └── admin/          # Admin dashboard (6 tabs)
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── server/                     # Express API
│   ├── db/init.js              # SQLite schema, migrations, seed data
│   ├── middleware/              # auth, adminAuth, integrationAuth, requireRole
│   ├── routes/                 # auth, steps, admin, adminAuth, integrations
│   ├── utils/                  # audit, progress, tags, step keys
│   └── index.js                # App entry point
│
├── nixpacks.toml               # Deployment config
└── package.json                # Root scripts (dev, build, start)
```

---

## Environment Variables

Create a `.env` file in `server/`:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `CORS_ORIGIN` | Allowed origin for CORS | `http://localhost:3000` |
| `JWT_SECRET` | Secret key for JWT signing | `dev-secret-key-change-in-production` |
| `DB_PATH` | SQLite database file path | `./data/admissions.db` |
| `ADMIN_DEFAULT_EMAIL` | Default admin email (seeded on first run) | `admin@csub.edu` |
| `ADMIN_DEFAULT_PASSWORD` | Default admin password | `admin123` |
| `INTEGRATION_DEFAULT_NAME` | Seeded dev integration client name | `Dev Client` |
| `INTEGRATION_DEFAULT_KEY` | Seeded dev integration API key | `dev-integration-key` |
| `ALLOW_DEV_LOGIN` | Allow `POST /api/auth/dev-login` in production | `false` |

---

## Deployment

```bash
# Build for production
npm run build

# Start production server (serves client + API)
npm start
```

In production, the Express server serves the built client from `client/dist/` and handles all API routes. The application runs as a single process — no separate web server is required. It is compatible with any container-based hosting platform.

---

## License

This project was built for CSUB Admissions. All rights reserved.
