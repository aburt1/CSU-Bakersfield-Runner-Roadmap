# CSUB Admissions Guide — Road to Becoming a Roadrunner

An interactive, road-themed student onboarding application for California State University, Bakersfield. Guides newly admitted students through every step of the admissions process — from acceptance to their first day of classes.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
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
- **Admin dashboard** — Manage students, steps, analytics, audit logs, academic terms, and admin users
- **Integration API** — REST API for external systems (SIS, ERP, etc.) to sync step completions via stable keys with idempotent batch support
- **Outbound API checks** — Poll external APIs to auto-verify step completion (configurable per step with encrypted credentials)
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
| **Frontend** | React 18, Vite 6, Tailwind CSS 3, Framer Motion, Recharts, Tiptap, DOMPurify |
| **Backend** | Node.js, Express 4, PostgreSQL, JWT authentication |
| **Auth** | Azure AD SSO integration, JWT sessions, bcrypt password hashing |
| **Security** | Helmet, CORS, express-rate-limit, AES-256-GCM credential encryption |
| **Deployment** | Docker containerized single-process server (serves API + static frontend) |

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

The app supports two integration patterns for connecting with external systems. See the **[API Integration Guide](docs/API-GUIDE.md)** for full endpoint references, request/response examples, authentication details, error codes, and setup instructions.

### Inbound — Push Data In

External systems (e.g., PeopleSoft) call our API to update student step completions. Authenticated via integration key (`X-Integration-Key` header or `Bearer` token). A dev key is seeded automatically on first run.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/integrations/v1/step-catalog` | Discover available step keys per term |
| `PUT` | `/api/integrations/v1/step-completions` | Update one student's step status |
| `POST` | `/api/integrations/v1/step-completions/batch` | Batch update multiple completions |

Key concepts: students identified by emplid (`student_id_number`), steps by `step_key`, all requests require a `source_event_id` for idempotent retries.

### Outbound — Poll External APIs

The app can poll external HTTP endpoints to auto-check whether a student has completed a step. Sysadmins configure a URL template (with `{{studentId}}` placeholder), auth credentials, and a response field path per step. When a student triggers a check, the app calls each configured endpoint and marks steps based on the response.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PUT` | `/api/admin/steps/:id/api-check` | Configure an outbound check (sysadmin) |
| `POST` | `/api/admin/steps/:id/api-check/test` | Test a check with a sample student (sysadmin) |
| `POST` | `/api/roadmap/run-api-checks` | Student triggers a check run (5-min cooldown) |

## API Overview

All routes are prefixed with `/api/`. See the [API Integration Guide](docs/API-GUIDE.md) for integration endpoints.

| Route | Description |
|-------|-------------|
| `POST /api/auth/dev-login` | Student dev login |
| `GET /api/steps` | List active admissions steps |
| `GET /api/steps/progress` | Student progress (authenticated) |
| `PUT /api/steps/:stepId/status` | Student self-service update for optional steps |
| `POST /api/roadmap/run-api-checks` | Trigger outbound API checks (student) |
| `GET /api/admin/students` | Paginated student list (admin) |
| `POST /api/admin/students/:studentId/steps/:stepId/complete` | Mark step completed or waived (admin) |
| `DELETE /api/admin/students/:studentId/steps/:stepId/complete` | Remove completion (admin) |
| `PUT /api/admin/steps/reorder` | Reorder steps (editor+) |
| `GET /api/admin/analytics/*` | Charts and stats (admin) |
| `GET /api/admin/audit` | Audit log with filters (admin) |
| `GET /api/admin/export/progress` | CSV export (admin) |
| `PUT /api/admin/steps/:id/api-check` | Configure outbound API check (sysadmin) |

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
│   ├── db/init.js              # PostgreSQL schema, migrations, seed data
│   ├── middleware/              # auth, adminAuth, integrationAuth, requireRole
│   ├── routes/                 # auth, steps, admin, adminAuth, integrations, apiChecks
│   ├── utils/                  # audit, progress, tags, step keys, encryption, apiCheckRunner
│   └── index.js                # App entry point
│
├── docs/                       # Documentation
│   ├── API-GUIDE.md            # Integration API guide (inbound + outbound)
│   └── screenshots/            # App screenshots
│
├── docker-compose.yml          # Docker services
├── Dockerfile                  # Container build
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
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://localhost:5432/admissions` |
| `ADMIN_DEFAULT_EMAIL` | Default admin email (seeded on first run) | `admin@csub.edu` |
| `ADMIN_DEFAULT_PASSWORD` | Default admin password | `admin123` |
| `INTEGRATION_DEFAULT_NAME` | Seeded dev integration client name | `PeopleSoft Dev` |
| `INTEGRATION_DEFAULT_KEY` | Seeded dev integration API key | `dev-integration-key` |
| `API_CHECK_ENCRYPTION_KEY` | 64-char hex key for encrypting outbound API check credentials | — |
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
