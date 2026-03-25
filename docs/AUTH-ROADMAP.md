# Authentication Roadmap

## Current State

The application has two separate authentication systems:

### Student Authentication
- **Method:** Development login (`POST /api/auth/dev-login`)
- **How it works:** Students enter their name and email. The server creates or finds a student record and returns a JWT token.
- **Token storage:** `sessionStorage` (cleared on tab close)
- **Token lifetime:** 8 hours
- **Where:** `client/src/auth/AuthProvider.jsx`, `server/routes/auth.js`

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

## What's Stubbed for Azure AD SSO

Environment variable placeholders exist in both `.env.example` files but **no Azure AD logic is implemented yet**:

**Server (`server/.env.example`):**
```
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_REDIRECT_URI=http://localhost:3001/api/auth/callback
```

**Client (`client/.env.example`):**
```
VITE_AZURE_AD_CLIENT_ID=your-client-id
VITE_AZURE_AD_TENANT_ID=your-tenant-id
VITE_AZURE_AD_REDIRECT_URI=http://localhost:3000
```

The `ALLOW_DEV_LOGIN` flag in `server/routes/auth.js` is designed to disable dev login when set to `false` in production, but there is no alternative login flow implemented yet.

---

## What's Needed for Production

### 1. Azure AD SSO Integration (Student Login)
- Install `@azure/msal-node` (server) and `@azure/msal-browser` (client)
- Implement OAuth 2.0 authorization code flow:
  - `GET /api/auth/login` — redirect to Azure AD
  - `GET /api/auth/callback` — handle the redirect, exchange code for tokens
- Map Azure AD user claims to student records (use `azure_id` column already in students table)
- Update `AuthProvider.jsx` to use MSAL browser SDK for token acquisition
- Remove or gate the dev login endpoint behind `ALLOW_DEV_LOGIN`

### 2. Production Security Checklist
- [ ] Generate a strong random `JWT_SECRET` (at least 64 characters)
- [ ] Set `ADMIN_DEFAULT_PASSWORD` to a strong password via environment variable
- [ ] Register the application in Azure AD and configure redirect URIs
- [ ] Set `ALLOW_DEV_LOGIN=false` in production environment
- [ ] Configure `CORS_ORIGIN` to match the production domain
- [ ] Set `API_CHECK_ENCRYPTION_KEY` (64-character hex string) for outbound API credential encryption
- [ ] Review rate limiting settings (currently 200 requests per 15 minutes)

### 3. Optional Enhancements
- Admin SSO: Extend Azure AD integration to admin login (currently email/password only)
- Token refresh: Implement silent token renewal before expiration
- Session management: Add "remember me" option with `localStorage` instead of `sessionStorage`
