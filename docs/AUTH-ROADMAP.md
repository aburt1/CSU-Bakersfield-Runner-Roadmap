# Authentication Roadmap

## Current State

The application has two separate authentication systems:

### Student Authentication
- **Method:** Development login (`POST /api/auth/dev-login`)
- **How it works:** Students enter their name and email. The server creates or finds a student record and returns a JWT token.
- **Token storage:** `sessionStorage` (cleared on tab close)
- **Token lifetime:** 8 hours
- **Where:** `client/src/auth/AuthProvider.jsx`, `server/routes/auth.js`
- **Note:** Azure AD SSO is also implemented and available — disabled by default (see below)

### Admin Authentication
- **Method:** Email/password login (`POST /api/admin-auth/login`)
- **How it works:** Admins log in with email and bcrypt-hashed password. The server returns a JWT with role info.
- **Token storage:** `sessionStorage`
- **Token lifetime:** 8 hours
- **RBAC roles:** `viewer`, `admissions`, `admissions_editor`, `sysadmin`
- **Where:** `client/src/pages/admin/AdminLogin.jsx`, `server/routes/adminAuth.js`

### Integration Authentication
- **Method:** API key (`X-Integration-Key` header or `Bearer` token)
- **How it works:** External systems authenticate with a bcrypt-verified integration key
- **Where:** `server/middleware/integrationAuth.js`

---

## Azure AD SSO (Implemented — Disabled by Default)

Azure AD SSO is fully implemented but only activates when `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` are set in the environment. When those variables are absent, the app falls back to dev login as before.

### Client
- **MSAL config and instance:** `client/src/auth/msalConfig.js` — exports the MSAL `PublicClientApplication` instance and configuration
- **Auth flow:** `AuthProvider.jsx` attempts a popup login via MSAL and falls back to redirect if popups are blocked
- **UI entry point:** SSO button rendered in `PublicRoadmapPreview.jsx` when `VITE_AZURE_AD_CLIENT_ID` is set

### Server
- **Endpoint:** `POST /api/auth/sso` — accepts a Microsoft ID token from the client
- **Validation:** `server/utils/azureAdToken.js` validates the token signature via JWKS (Microsoft's public key endpoint) and verifies audience/issuer claims
- **Student mapping:** Validated Azure AD claims are mapped to student records using the `azure_id` column in the students table

### Enabling SSO

Set the following environment variables on both client and server:

**Server (`server/.env.example`):**
```
# Server Configuration
PORT=3001
NODE_ENV=development

# Azure AD Configuration (for SSO — leave unset to disable)
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_TENANT_ID=your-tenant-id

# Dev Login (set to 'false' in production to disable dev login endpoint)
ALLOW_DEV_LOGIN=true

# JWT Secret (for session tokens)
JWT_SECRET=change-this-to-a-secure-random-string

# Admin API Key (for external systems to update student progress)
ADMIN_API_KEY=change-this-to-a-secure-random-key

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/csub_admissions
```

**Client (`client/.env.example`):**
```
# Azure AD Configuration (client-side)
VITE_AZURE_AD_CLIENT_ID=your-client-id
VITE_AZURE_AD_TENANT_ID=your-tenant-id
VITE_AZURE_AD_REDIRECT_URI=http://localhost:3000

# Dev Login UI (set to 'false' to hide the dev login form)
VITE_ALLOW_DEV_LOGIN=true
```

---

## What's Needed for Production

### 1. Activate Azure AD SSO
- Register the application in the Azure AD portal and note the client ID and tenant ID
- Set `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` in `server/.env`
- Set `VITE_AZURE_AD_CLIENT_ID` and `VITE_AZURE_AD_TENANT_ID` in `client/.env`
- Set `VITE_AZURE_AD_REDIRECT_URI` to the production frontend URL in `client/.env`
- Set `ALLOW_DEV_LOGIN=false` in `server/.env` to disable the dev login endpoint
- Set `VITE_ALLOW_DEV_LOGIN=false` in `client/.env` to hide the dev login form

### 2. Production Security Checklist
- [ ] Generate a strong random `JWT_SECRET` (at least 64 characters)
- [ ] Set `ADMIN_DEFAULT_PASSWORD` to a strong password via environment variable
- [ ] Register the application in Azure AD and configure redirect URIs
- [ ] Set `ALLOW_DEV_LOGIN=false` in production environment
- [ ] Set `VITE_ALLOW_DEV_LOGIN=false` in production client environment
- [ ] Configure `CORS_ORIGIN` to match the production domain
- [ ] Set `API_CHECK_ENCRYPTION_KEY` (64-character hex string) for outbound API credential encryption
- [ ] Review rate limiting settings (currently 200 requests per 15 minutes)

### 3. Optional Enhancements
- Admin SSO: Extend Azure AD integration to admin login (currently email/password only)
- Token refresh: Implement silent token renewal before expiration using MSAL's `acquireTokenSilent`
- Session management: Add "remember me" option with `localStorage` instead of `sessionStorage`
