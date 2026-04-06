# Architecture

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite 6, Tailwind CSS 3, Framer Motion, Recharts, Tiptap, DOMPurify |
| **Backend** | Node.js 20, Express 4, TypeScript, PostgreSQL 16 |
| **Auth** | JWT sessions, bcrypt password hashing, Azure AD SSO (optional) |
| **Security** | Helmet, CORS, express-rate-limit, AES-256-GCM credential encryption |
| **Testing** | Vitest, Supertest, Testing Library |
| **Deployment** | Docker containerized single-process server |

---

## Project Structure

```
CSUB-admissions/
├── client/                        # React SPA (Vite + Tailwind)
│   ├── src/
│   │   ├── auth/                  # AuthProvider context, MSAL config
│   │   ├── components/
│   │   │   └── roadmap/           # TimelineStep, StepDetailPanel, ListView
│   │   ├── hooks/                 # useProgress custom hook
│   │   ├── pages/
│   │   │   ├── RoadmapPage.tsx    # Main student view
│   │   │   └── admin/             # Admin dashboard (5 tabs)
│   │   ├── types/                 # Shared TypeScript types
│   │   └── __tests__/             # Component tests (Vitest + Testing Library)
│   ├── vitest.config.ts
│   ├── tailwind.config.js
│   └── vite.config.js             # Dev proxy to :3001
│
├── server/                        # Express API
│   ├── db/
│   │   ├── pool.ts                # PostgreSQL connection pool + paramBuilder
│   │   ├── init.ts                # Schema creation, migrations, seed data
│   │   └── seed.ts                # Development data seeder
│   ├── middleware/
│   │   ├── auth.ts                # Student JWT auth
│   │   ├── adminAuth.ts           # Admin JWT + API key auth
│   │   ├── integrationAuth.ts     # Integration key auth
│   │   └── requireRole.ts         # RBAC middleware factory
│   ├── routes/
│   │   ├── admin/                 # Admin routes (split by concern)
│   │   │   ├── index.ts           # Router aggregator + adminAuth
│   │   │   ├── analytics.ts       # Stats, charts, filter builders
│   │   │   ├── steps.ts           # Step CRUD, reorder, duplicate
│   │   │   ├── students.ts        # Student progress, tags, profiles
│   │   │   ├── terms.ts           # Term CRUD, clone
│   │   │   └── users.ts           # Admin user CRUD
│   │   ├── auth.ts                # Student auth (dev login, SSO)
│   │   ├── adminAuth.ts           # Admin auth (login, SSO, break-glass)
│   │   ├── steps.ts               # Public step routes
│   │   ├── integrations.ts        # Inbound integration API
│   │   └── apiChecks.ts           # Outbound API check config
│   ├── utils/
│   │   ├── queryHelpers.ts        # Shared SQL helpers (parseTermId, etc.)
│   │   ├── progress.ts            # Step completion logic
│   │   ├── studentTags.ts         # Tag derivation and merging
│   │   ├── audit.ts               # Audit logging
│   │   └── stepKeys.ts            # Unique step key generation
│   ├── types/                     # TypeScript types (Db, models, Express)
│   ├── tests/
│   │   ├── setup.ts               # Test DB, auth helpers, app factory
│   │   ├── unit/                  # Pure function tests
│   │   └── integration/           # Route tests against real PostgreSQL
│   ├── vitest.config.ts
│   └── index.ts                   # App entry point
│
├── docs/                          # Documentation
├── docker-compose.yml
├── Dockerfile
└── package.json                   # Root workspace scripts
```

---

## How Student Steps Work

Each student's roadmap is built from four things:

1. **Assigned term** — Students are assigned to a term (e.g., Fall 2026). They only see steps from their `term_id`.

2. **Step visibility rules** — Each step can have `required_tags` and `excluded_tags`. A step only appears for a student if their tags match the requirements.

3. **Manual + derived tags** — Tags come from two sources:
   - **Manual tags**: Set by admissions staff (e.g., `honors`, `athlete`, `eop`)
   - **Derived tags**: Auto-generated from profile fields (e.g., `applicant_type: "Transfer"` produces the `transfer` tag, `major: "Computer Science"` produces `major:computer-science`)

4. **Progress records** — Each step can be `completed`, `waived`, or `not_completed`. Progress is tracked in the `student_progress` table with timestamps and attribution.

---

## Data Flow

```
Student loads roadmap
  → GET /api/steps (filtered by term + auth)
  → GET /api/steps/progress (completion status + tags)
  → Client merges steps + progress + tag filtering
  → Renders personalized timeline

Admin updates student
  → POST /api/admin/students/:id/steps/:stepId/complete
  → Server: applyStudentProgressChange() with FOR UPDATE lock
  → Audit log entry created
  → Student sees update on next load

Integration pushes completion
  → PUT /api/integrations/v1/step-completions
  → Authenticated via integration key
  → Same applyStudentProgressChange() path
  → Idempotent via source_event_id
```

---

## Key Design Decisions

- **No ORM** — Raw SQL with parameterized queries via the `Db` interface. The `paramBuilder()` utility generates positional `$1, $2, ...` placeholders safely.
- **Transaction rollback tests** — Integration tests run inside PostgreSQL transactions that roll back after each test, keeping the dev database clean.
- **Split admin routes** — The admin API was split from a single 1,660-line file into 5 focused modules (analytics, steps, students, terms, users) mounted via a shared router.
- **Shared query helpers** — Common patterns like `parseTermId()`, `parsePagination()`, and `countActiveSteps()` are extracted to `utils/queryHelpers.ts` to eliminate duplication.
