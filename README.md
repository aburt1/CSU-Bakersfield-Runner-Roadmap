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
- **Tag-based step filtering** — Show steps conditionally based on student tags (first-gen, transfer, veteran, honors, athlete, EOP, out-of-state)
- **WYSIWYG rich text editor** — Tiptap-based editor for formatting step instructions with inline links
- **Drag-and-drop reordering** — Reorder admissions steps with a grip handle (Framer Motion)
- **Role-based access control** — Four-tier RBAC: viewer, admissions, admissions_editor, sysadmin
- **Multi-term support** — Manage separate cohorts (Fall 2026, Spring 2027, etc.)
- **Server-side pagination** — Sortable, filterable student lists with overdue deadline detection
- **Audit logging** — Full history of admin actions for accountability
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
| **Auth** | Azure AD (MSAL) integration, JWT sessions, bcrypt password hashing |
| **Security** | Helmet, CORS, express-rate-limit |
| **Deployment** | Nixpacks (Coolify-ready), single-process production server |

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

## Project Structure

```
CSUB-admissions/
├── client/                     # React SPA (Vite)
│   ├── src/
│   │   ├── 3d/                 # Three.js road scene components
│   │   ├── auth/               # Auth context + MSAL config
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
│   ├── middleware/              # auth, adminAuth, requireRole
│   ├── routes/                 # auth, steps, admin, adminAuth
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

---

## Deployment

The project is configured for [Nixpacks](https://nixpacks.com/) deployment (works with [Coolify](https://coolify.io/), Railway, etc.):

```bash
# Build for production
npm run build

# Start production server (serves client + API)
npm start
```

In production, the Express server serves the built client from `client/dist/` and handles all API routes. No separate web server needed.

---

## API Overview

All API routes are prefixed with `/api/`:

| Route | Description |
|-------|-------------|
| `POST /api/auth/dev-login` | Student dev login |
| `GET /api/steps` | List active admissions steps |
| `GET /api/steps/progress` | Student progress (authenticated) |
| `GET /api/admin/students` | Paginated student list (admin) |
| `PUT /api/admin/steps/reorder` | Reorder steps (editor+) |
| `GET /api/admin/analytics/*` | Charts and stats (admin) |
| `GET /api/admin/audit` | Audit log with filters (admin) |
| `GET /api/admin/export/progress` | CSV export (admin) |

---

## License

This project was built for CSUB Admissions. All rights reserved.
