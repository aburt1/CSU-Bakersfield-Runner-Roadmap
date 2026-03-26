# Admin Azure AD SSO & Break-Glass Login Design

**Date:** 2026-03-25
**Goal:** Extend Azure AD SSO to the admin portal with app-managed roles, and add a hidden break-glass local login at `/admin/local-login` that bypasses the database entirely.

## Context

The student-side Azure AD SSO is already implemented (disabled until env vars are set). The admin portal currently uses email/password login against the `admin_users` table. This design extends SSO to admins and adds a break-glass account for emergency access.

**Already in place:**
- `client/src/auth/msalConfig.js` — MSAL `PublicClientApplication` instance (reused)
- `server/utils/azureAdToken.js` — Azure AD ID token validation via JWKS (reused)
- `admin_users` table with `email`, `password_hash`, `role`, `display_name`, `is_active`
- RBAC roles: `viewer`, `admissions`, `admissions_editor`, `sysadmin`
- Admin user management UI in the Users tab (sysadmin only)
- `client/src/pages/admin/AdminLogin.jsx` — current email/password login form
- `client/src/pages/admin/AdminPage.jsx` — auth guard: `if (!token) return <AdminLogin />`
- `AdminPage` is NOT inside `AuthProvider` — it manages its own token state

---

## 1. Admin SSO Flow

### New endpoint: `POST /api/admin/auth/sso`

Reuses `verifyAzureAdToken()` from `server/utils/azureAdToken.js`.

**Request body:** `{ idToken: "eyJ..." }`

**Logic:**
1. Check `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` are set → 501 if not
2. Validate ID token via `verifyAzureAdToken(idToken)` → 401 if invalid
3. Extract claims: `oid` (azure object ID), `email`, `name`
4. Look up `admin_users` by `azure_id = oid` first
5. If not found by `azure_id` → look up by `email` (case-insensitive)
6. If not found at all → 403 "No admin account found. Contact your system administrator."
7. Check `is_active = 1` → 403 "Account is inactive" if not active
8. If found by email but `azure_id` is null → update `azure_id = oid` (links account on first SSO)
9. Update `display_name` from latest claims
10. Sign admin JWT: `{ adminId, role, email, displayName }` with 8h expiry
11. Return `{ token, user: { id, email, displayName, role } }`

**No auto-creation.** Admins must be pre-created in the Users tab. Azure AD handles authentication; the app handles authorization (roles).

**Error responses:**
- 501: Azure AD not configured
- 400: Missing idToken
- 401: Invalid or expired token
- 403: No admin account / inactive account

### Changes to: `server/routes/adminAuth.js`

Add the `POST /sso` route. Import `verifyAzureAdToken` from `../utils/azureAdToken.js`.

---

## 2. Break-Glass Local Login

### New endpoint: `POST /api/admin/auth/local-login`

A database-independent emergency login. Both `ADMIN_BREAK_GLASS_USERNAME` and `ADMIN_BREAK_GLASS_PASSWORD` env vars must be set for this to work.

**Request body:** `{ username, password }`

**Logic:**
1. Check both `ADMIN_BREAK_GLASS_USERNAME` and `ADMIN_BREAK_GLASS_PASSWORD` env vars are set → 404 if not (endpoint is invisible)
2. Compare credentials using constant-time HMAC approach: compute `crypto.createHmac('sha256', appSecret).update(submitted)` and `crypto.createHmac('sha256', appSecret).update(expected)` for both username and password, then pass the equal-length digests to `crypto.timingSafeEqual`. This prevents timing attacks and avoids the `TypeError` thrown when `timingSafeEqual` receives buffers of different lengths.
3. On mismatch → 401
4. On match → sign admin JWT with `{ adminId: 'break-glass', role: 'sysadmin', email: 'break-glass', displayName: 'Break Glass Admin' }`
5. Log every attempt (success and failure) to `audit_log` with `entity_type: 'break-glass'` — best-effort (don't fail if DB is down)
6. Return `{ token, user: { id: 'break-glass', email: 'break-glass', displayName: 'Break Glass Admin', role: 'sysadmin' } }`

**Rate limiting:** 5 attempts per 15 minutes per IP (separate from global rate limit). The rate limit counter is not reset on successful login — break-glass access is inherently high-risk and all attempts should be minimized within any window.

**Security properties:**
- Returns 404 when env vars aren't set (indistinguishable from nonexistent route)
- Constant-time HMAC comparison prevents timing attacks
- No database dependency for authentication
- Unknown URL + unknown username + unknown password = three factors an attacker must discover

### Changes to: `server/routes/adminAuth.js`

Add the `POST /local-login` route with dedicated rate limiter.

---

## 3. Admin Login UI

### Changes to: `client/src/pages/admin/AdminLogin.jsx`

The component receives `onLogin` prop (existing) and now also imports `isAzureAdConfigured`, `msalInstance`, and `loginRequest` from `../../auth/msalConfig`.

**MSAL initialization:** On mount, if `isAzureAdConfigured`, call `msalInstance.initialize()` followed by `msalInstance.handleRedirectPromise()`. If the redirect response contains an `idToken`, send it to `POST /api/admin/auth/sso` and call `onLogin(token, user)`. Only after initialization completes should the SSO button be enabled. Use a `useRef` for `msalReady` and a `redirecting` ref (same pattern as student `AuthProvider`).

**Popup + redirect fallback:** Same pattern as student SSO — try `loginPopup()`, catch `BrowserAuthError` with codes `popup_window_error`, `empty_window_error`, `popup_timeout`, fall back to `loginRedirect()`.

**When Azure AD is configured:**
- Show "Sign in with CSUB Account" SSO button (same style as student SSO button)
- SSO button calls MSAL popup → sends ID token to `POST /api/admin/auth/sso` → receives JWT + user → calls `onLogin(token, user)`
- Button disabled with spinner during `ssoLoading`
- Error message displayed inline on failure
- No email/password form visible

**When Azure AD is NOT configured:**
- Show email/password form exactly as today
- Zero visual change

### New file: `client/src/pages/admin/AdminLocalLogin.jsx`

Standalone page for break-glass login. Always shows a username + password form.

**UI:**
- Same minimal styling as current `AdminLogin.jsx`
- Heading: "Local Admin Login"
- Username field + password field + submit button
- Posts to `POST /api/admin/auth/local-login`
- On success → stores admin JWT in `sessionStorage` (key: `csub_admin_token`) and navigates to `/admin`
- Not linked from anywhere in the app

`AdminLocalLogin` must not be wrapped in `AuthProvider`. It manages its own state and writes directly to `sessionStorage` before navigating to `/admin`. Add as a sibling `<Route>` alongside the existing `/admin` route, not nested under it.

### Changes to: `client/src/main.jsx`

Add route as a sibling to the existing `/admin` route:
```jsx
<Route path="/admin/local-login" element={<AdminLocalLogin />} />
```

### Changes to: `client/src/pages/admin/AdminPage.jsx`

Import `isAzureAdConfigured` directly from `../../auth/msalConfig` (not from `AuthProvider`). No other changes — the auth guard (`if (!token) return <AdminLogin />`) stays the same.

---

## 4. Admin User Management Changes

### Changes to: `client/src/pages/admin/AdminUsersTab.jsx`

**When Azure AD is configured:**
- Remove the password field from the create/edit user form
- Creating a user only requires: display name, email, role
- Editing a user allows changing: display name, role (email stays read-only, as it is today)

**When Azure AD is NOT configured:**
- Keep the password field as-is (needed for email/password login)

The component imports `isAzureAdConfigured` from `../../auth/msalConfig` and conditionally renders the password field.

### Changes to: `server/routes/admin.js`

Update `POST /users` (create) to make `password` optional. When Azure AD is configured and no password is provided, generate a random unusable password hash (the user will never use it — they'll SSO). When Azure AD is not configured, password remains required.

Update `PUT /users/:id` (edit) — no changes needed, password is already optional on edit.

---

## 5. Database & Environment

### Migration in `server/db/init.js`

Add to the migrations array:
```sql
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS azure_id TEXT UNIQUE
```

**Note:** The `UNIQUE` constraint on `admin_users.azure_id` is table-scoped and does not conflict with the `students.azure_id` column — an Azure AD user may legitimately appear in both tables with the same `oid`.

### New env vars (`server/.env.example`)

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_BREAK_GLASS_USERNAME` | No | Break-glass local admin username |
| `ADMIN_BREAK_GLASS_PASSWORD` | No | Break-glass local admin password |

Both must be set for break-glass to work. If either is missing, `POST /api/admin/auth/local-login` returns 404.

No new client env vars — reuses existing `VITE_AZURE_AD_CLIENT_ID` and `VITE_AZURE_AD_TENANT_ID`.

### Seeded admin account

- **Development** (`NODE_ENV !== 'production'`): Keep seeding `admin@csub.edu` with default password for local dev
- **Production**: Break-glass env vars replace the seeded account as the bootstrap mechanism

---

## 6. Files Changed

| File | Action | Description |
|------|--------|-------------|
| `server/routes/adminAuth.js` | Modify | Add `POST /sso` and `POST /local-login` endpoints |
| `server/routes/admin.js` | Modify | Make password optional on `POST /users` when Azure AD configured |
| `server/db/init.js` | Modify | Add `azure_id` column migration to `admin_users` |
| `client/src/pages/admin/AdminLogin.jsx` | Modify | Add SSO button with MSAL init/popup/redirect, hide password form |
| `client/src/pages/admin/AdminLocalLogin.jsx` | New | Break-glass username/password login page |
| `client/src/pages/admin/AdminUsersTab.jsx` | Modify | Hide password field when Azure AD is configured |
| `client/src/pages/admin/AdminPage.jsx` | Modify | Import `isAzureAdConfigured` from msalConfig |
| `client/src/main.jsx` | Modify | Add `/admin/local-login` route |
| `server/.env.example` | Modify | Add `ADMIN_BREAK_GLASS_USERNAME` and `ADMIN_BREAK_GLASS_PASSWORD` |
| `docs/AUTH-ROADMAP.md` | Modify | Update to reflect admin SSO and break-glass |

---

## 7. Verification

1. **Without Azure AD vars:** `/admin` shows email/password form as today. No SSO button.
2. **With Azure AD vars:** `/admin` shows SSO button only. No password form.
3. **Admin SSO — pre-created user:** SSO login succeeds, admin gets their assigned role.
4. **Admin SSO — unknown user:** SSO login fails with "No admin account found" message.
5. **Admin SSO — first login (email match):** `azure_id` is saved on the `admin_users` record.
6. **Admin SSO — inactive user:** SSO login fails with 403, `azure_id` is NOT linked.
7. **Break-glass — env vars set:** `/admin/local-login` shows form, correct credentials grant sysadmin access.
8. **Break-glass — env vars not set:** `POST /api/admin/auth/local-login` returns 404.
9. **Break-glass — wrong credentials:** Returns 401, attempt logged to audit.
10. **Break-glass — rate limit:** After 5 failed attempts, returns 429. Counter does not reset on success.
11. **No link to `/admin/local-login`** exists anywhere in the UI.
12. **Users tab — Azure AD configured:** Password field hidden on create/edit form.
13. **Users tab — Azure AD not configured:** Password field present as today.
14. **Popup blocked:** Falls back to redirect flow automatically.
15. **Production build:** `npm run build` succeeds.
