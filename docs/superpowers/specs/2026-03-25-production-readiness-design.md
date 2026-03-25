# Production Readiness & Cleanup Design

**Date:** 2026-03-25
**Goal:** Prepare the CSUB Admissions app for lead developer review — clean up code, fix .gitignore, document everything, take fresh screenshots, and fix bugs.

## Context

The app is feature-complete for its current scope but needs polish before showing to the lead developer. Auth (Azure AD SSO) is not yet implemented — only dev login exists. The codebase has accumulated debug logging, unused imports, and the .gitignore is too minimal. Documentation needs updating with fresh screenshots and an auth roadmap.

---

## 1. .gitignore & Git Hygiene

**Current state:** 7 entries (node_modules, dist, .env, *.db, *.sqlite, .DS_Store, Thumbs.db).

**Add these entries:**
```
# Local env overrides
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log
npm-debug.log*

# Test coverage
coverage/

# Tooling artifacts
.claude/
.superpowers/
```

**No git history rewrite needed** — `server/.env` is confirmed not tracked.

## 2. Aggressive Code Cleanup

### 2a. Gate mock endpoints behind dev-only check
- **File:** `server/index.js` (line 78)
- Wrap `app.use('/api/mock', mockApiChecksRouter)` in `if (process.env.NODE_ENV !== 'production')`
- This prevents mock data endpoints from being accessible in production

### 2b. Remove unused imports
- **`client/src/pages/admin/charts/DeadlineRiskChart.jsx`** line 1: Remove entire recharts import (component renders a table, not a chart)
- **`client/src/pages/admin/charts/CompletionVelocityChart.jsx`** line 2: Remove unused `Cell` from recharts import

### 2c. Clean up console.log statements
**Remove** (debug/seed reporting — not needed in production):
- `server/db/init.js`: lines 116, 187, 203, 205, 216, 363 (seed logging)
- `server/scripts/importFall2026Checklist.js`: lines 33-41 (import reporting — this is a CLI script, keep its logging)

**Keep** (operational error handling):
- All `console.error` statements (proper error logging)
- All `console.warn` in `apiCheckRunner.js` (operational warnings)
- `server/index.js` startup/shutdown logs (standard server lifecycle)
- `server/dev.js` logs (development only)

**Keep** (CLI script — meant to output to terminal):
- `server/scripts/importFall2026Checklist.js` — all console statements (this is a standalone script, not server code)

### 2d. Clean up local artifacts
- Delete `.DS_Store` if present at repo root

## 3. Documentation

### 3a. AUTH-ROADMAP.md (new file)
Create `docs/AUTH-ROADMAP.md` covering:
- **Current state:** Dev login (student), email/password (admin), JWT sessions
- **What's stubbed:** Azure AD config in `.env.example`, MSAL references in client
- **What's needed for production:** Implement Azure AD callback, wire MSAL client, remove dev login fallback
- **Security notes:** JWT secret must be rotated, default admin password must be changed

### 3b. SETUP.md (new file)
Create `docs/SETUP.md` covering:
- Prerequisites (Node 20, PostgreSQL 16 or Docker)
- Install steps (`npm run install:all`)
- Database setup (auto-initializes on first run)
- Environment variables (reference .env.example files)
- Running locally (`npm run dev`)
- Docker option (`docker-compose up`)

### 3c. README.md (rewrite)
- Keep the good bones of current README but refresh with:
  - Updated screenshots (new captures from all major views)
  - Cleaner feature list
  - Link to AUTH-ROADMAP.md for auth status
  - Link to SETUP.md for detailed setup
  - Link to API-GUIDE.md for integrations
  - Project structure diagram (updated if needed)

## 4. Fresh Screenshots

Start the dev server and capture screenshots of:
1. Public landing page
2. Student dashboard (logged in)
3. Admin dashboard — Students tab
4. Admin dashboard — Analytics tab
5. Admin dashboard — Steps management tab

Save to `docs/screenshots/` replacing old ones. Embed in README.

## 5. Bug Fixes & Production Hardening

### 5a. Silent error swallowing
- **File:** `server/routes/admin.js` line 35
- Add `console.error` for failed JSON parse instead of silent catch

### 5b. Gate seed data behind environment check
- **File:** `server/db/init.js`
- Wrap sample student seeding (50 fake students) behind `NODE_ENV !== 'production'`
- Keep default admin user seeding (needed for first-run setup) but log a warning

### 5c. Admin route guard (client-side)
- Add auth check in the admin page component — redirect to login if not authenticated
- The API is already protected, but this improves UX

---

## Verification

1. Start the dev server — confirm no errors
2. Navigate to all major pages — confirm no console errors in browser
3. Verify mock endpoints are NOT accessible when `NODE_ENV=production`
4. Verify screenshots are captured and embedded in README
5. Review all documentation for accuracy
6. Run `git status` to confirm .gitignore works correctly
