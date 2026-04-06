# CSUB Admissions Guide — Road to Becoming a Roadrunner

An interactive student onboarding application for California State University, Bakersfield. Guides newly admitted students through every step of the admissions process — from acceptance to their first day of classes.

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)

---

## Screenshots

### Public Landing Page
<img src="docs/screenshots/public-preview.png" alt="Public landing page" width="720" />

### Student Dashboard
<img src="docs/screenshots/student-dashboard.png" alt="Student dashboard with progress tracking" width="720" />

### Admin Dashboard
<img src="docs/screenshots/admin-dashboard.png" alt="Admin dashboard" width="720" />

---

## Features

- **Interactive admissions roadmap** with personalized step tracking and deadline awareness
- **Admin dashboard** for managing students, steps, analytics, audit logs, terms, and users
- **Integration API** for external systems (SIS, ERP) with inbound push and outbound polling
- **Tag-based step filtering** to show relevant steps per student profile
- **Role-based access control** — viewer, admissions, admissions_editor, sysadmin
- **Multi-term support** for managing separate cohorts (Fall 2026, Spring 2027, etc.)
- **Accessible and responsive** — high-contrast mode, keyboard navigation, mobile-friendly

---

## Quick Start

```bash
npm run install:all    # Install all dependencies
npm run dev            # Start client (:3000) + server (:3001)
```

Default admin login: `admin@csub.edu` / `admin123`

See the [Development Setup Guide](docs/SETUP.md) for full instructions.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Development Setup](docs/SETUP.md) | Prerequisites, database, environment variables, scripts |
| [Architecture](docs/ARCHITECTURE.md) | Project structure, how student steps work, data flow |
| [Authentication](docs/AUTH-ROADMAP.md) | Auth systems, Azure AD SSO setup, production checklist |
| [API Integration](docs/API-GUIDE.md) | REST API reference for external system integration |
| [Testing](docs/TESTING.md) | Running tests, test strategy, adding new tests |
| [Development with Claude Code](docs/CLAUDE-CODE.md) | Using Claude Code with Superpowers for feature development |

---

## Deployment

```bash
npm run build   # Build client for production
npm start       # Start production server (serves client + API)
```

Or with Docker:

```bash
docker-compose up
```

The Express server serves the built client from `client/dist/` and handles all API routes as a single process.

---

## License

This project was built for CSUB Admissions. All rights reserved.
