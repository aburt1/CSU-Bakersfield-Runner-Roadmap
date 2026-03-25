# Development Setup Guide

## Prerequisites

- **Node.js 20+** and **npm 9+**
- **PostgreSQL 16** running locally, **or** Docker for containerized setup

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd CSUB-admissions

# Install all dependencies (root, client, server)
npm run install:all

# Start both dev servers
npm run dev
```

The client runs at [http://localhost:3000](http://localhost:3000) and proxies API calls to the server at port 3001.

## Database Setup

### Option A: Local PostgreSQL

1. Create a database:
   ```bash
   createdb csub_admissions
   ```

2. Copy the server env file:
   ```bash
   cp server/.env.example server/.env
   ```

3. Update `DATABASE_URL` in `server/.env` to match your local setup:
   ```
   DATABASE_URL=postgresql://your-user@localhost:5432/csub_admissions
   ```

The database schema, migrations, and seed data are applied automatically on first server start.

### Option B: Docker

```bash
docker-compose up
```

This starts both PostgreSQL and the application. The database initializes automatically.

## Environment Variables

### Server (`server/.env`)

Copy from `server/.env.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `3001`) |
| `NODE_ENV` | No | `development` or `production` (default: `development`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `ADMIN_DEFAULT_EMAIL` | No | First admin account email (default: `admin@csub.edu`) |
| `ADMIN_DEFAULT_PASSWORD` | No | First admin account password (default: `admin123`) |
| `ALLOW_DEV_LOGIN` | No | Enable student dev login (default: `true` in dev, `false` in prod) |
| `API_CHECK_ENCRYPTION_KEY` | No | 64-char hex key for encrypting outbound API credentials |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `http://localhost:3000` in dev) |

### Client (`client/.env`)

Copy from `client/.env.example`. These are only needed when Azure AD SSO is configured:

| Variable | Description |
|----------|-------------|
| `VITE_AZURE_AD_CLIENT_ID` | Azure AD application client ID |
| `VITE_AZURE_AD_TENANT_ID` | Azure AD tenant ID |
| `VITE_AZURE_AD_REDIRECT_URI` | OAuth redirect URI |

## Default Credentials

On first run, the database seeds:

| Account | Email | Password |
|---------|-------|----------|
| Admin (sysadmin) | `admin@csub.edu` | `admin123` |
| Sample students | Various `@csub.edu` emails | Dev login (name + email) |

50 sample students with realistic progress data are seeded in development mode only.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start client + server concurrently |
| `npm run dev:client` | Client only (Vite on :3000) |
| `npm run dev:server` | Server only (hot reload on :3001) |
| `npm run build` | Build client for production |
| `npm start` | Start production server |
| `npm run install:all` | Install all dependencies |
| `npm run import:fall-2026-checklist` | Import/update Fall 2026 checklist steps |

## Project Structure

```
CSUB-admissions/
├── client/                # React SPA (Vite + Tailwind)
│   ├── src/
│   │   ├── auth/          # AuthProvider context
│   │   ├── components/    # Shared UI components
│   │   ├── hooks/         # Custom hooks
│   │   └── pages/         # RoadmapPage + admin dashboard
│   └── vite.config.js     # Dev proxy to :3001
│
├── server/                # Express API
│   ├── db/                # Schema, migrations, seed data
│   ├── middleware/         # Auth middleware (student, admin, integration)
│   ├── routes/            # API route handlers
│   ├── utils/             # Shared utilities
│   └── index.js           # Entry point
│
├── docs/                  # Documentation
│   ├── API-GUIDE.md       # Integration API reference
│   ├── AUTH-ROADMAP.md    # Authentication roadmap
│   └── screenshots/       # App screenshots
│
├── docker-compose.yml     # Docker services
├── Dockerfile             # Container build
└── package.json           # Root workspace scripts
```
