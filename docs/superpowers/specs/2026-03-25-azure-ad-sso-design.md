# Azure AD SSO Integration Design

**Date:** 2026-03-25
**Goal:** Build out Azure AD SSO for student login using client-side MSAL with popup + redirect fallback. Keep it disabled until Azure AD env vars are configured.

## Context

The app currently uses a dev login (name + email form) for students. Azure AD SSO is needed for production but can't be enabled yet. This design implements the full integration in a way that's disabled by default and activates seamlessly when Azure AD env vars are set.

**Already in place:**
- `@azure/msal-browser` (client) and `@azure/msal-node` (server) packages installed
- `azure_id` column in students table
- Env var placeholders in both `.env.example` files
- JWT session management and `signToken()` utility
- `ALLOW_DEV_LOGIN` flag in auth routes

---

## 1. Client-Side MSAL Setup

### New file: `client/src/auth/msalConfig.js`

Creates and exports the MSAL `PublicClientApplication` instance.

**Configuration:**
- Reads `VITE_AZURE_AD_CLIENT_ID`, `VITE_AZURE_AD_TENANT_ID`, `VITE_AZURE_AD_REDIRECT_URI` from Vite env vars
- Authority URL: `https://login.microsoftonline.com/{tenantId}`
- Redirect URI defaults to `http://localhost:3000`
- Cache: `sessionStorage` (matches existing token storage pattern)

**Exports:**
- `msalInstance` — `PublicClientApplication` instance, or `null` if env vars are missing
- `isAzureAdConfigured` — boolean
- `loginRequest` — `{ scopes: ['openid', 'profile', 'email'] }`

**Disabled state:** If `VITE_AZURE_AD_CLIENT_ID` or `VITE_AZURE_AD_TENANT_ID` are not set, `msalInstance` is `null` and `isAzureAdConfigured` is `false`. No MSAL code runs.

### Changes to: `client/src/auth/AuthProvider.jsx`

**MSAL initialization:**
On mount, call `msalInstance.initialize()` (async, required before any MSAL operation in v5+). Then call `msalInstance.handleRedirectPromise()` to handle redirect fallback responses. Only after both resolve, proceed with existing `/api/auth/me` token validation. This ordering prevents race conditions between redirect handling and token validation.

**New method — `ssoLogin()`:**
1. Disable the SSO button (guard against `interaction_in_progress` errors from double-clicks)
2. Try `msalInstance.loginPopup(loginRequest)`
3. Catch `BrowserAuthError` with codes `popup_window_error`, `empty_window_error`, or `popup_timeout` → fall back to `msalInstance.loginRedirect(loginRequest)`
4. On success, extract the ID token from the popup response
5. Send `POST /api/auth/sso` with `{ idToken }` body
6. Receive `{ token, student }` from server
7. Store token in `sessionStorage`, set user state — same as `devLogin()` today
8. Re-enable SSO button

**Redirect fallback handling:**
On mount (after `initialize()`), call `msalInstance.handleRedirectPromise()`. If a redirect response is returned (user came back from Microsoft login), process it the same way — send ID token to server, store JWT.

**Logout integration:**
Update `logout()` to also call `msalInstance.clearCache()` when MSAL is configured, preventing stale Azure AD tokens in sessionStorage.

**Token refresh:** Not implemented — when the 8-hour app JWT expires, the user logs in again. MSAL's session cache may allow a seamless re-login without re-entering credentials.

**Updated context value:**
Adds `ssoLogin`, `ssoLoading` (boolean for button state), and `isAzureAdConfigured` to the provider value.

### Changes to: `client/src/App.jsx`

`PublicRoadmapPreview` currently receives login behavior via an `onLogin` prop from `App.jsx`. Update `PublicRoadmapPreview` to also consume `useAuth()` directly for `ssoLogin`, `ssoLoading`, and `isAzureAdConfigured`. The existing `onLogin` prop continues to handle dev login.

---

## 2. Server-Side Token Validation

### New file: `server/utils/azureAdToken.js`

Validates Azure AD ID tokens without needing a client secret.

**How it works:**
1. Fetches JWKS from `https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys`
2. Caches keys in memory with a 24-hour refresh timer
3. Decodes the ID token header to find the `kid` (key ID)
4. Finds the matching public key from the cached JWKS
5. **Cache-miss fallback:** If the `kid` is not found in the cache, re-fetches the JWKS immediately (Azure AD may have rotated keys). Only fails if the key is still not found after a fresh fetch.
6. Converts JWK to PEM using Node's built-in `crypto.createPublicKey({ key: jwk, format: 'jwk' })` (available in Node 16+)
7. Verifies the token using `jsonwebtoken.verify()` with:
   - Signature validation against the PEM public key
   - Audience check: must match `AZURE_AD_CLIENT_ID`
   - Issuer check: must match `https://login.microsoftonline.com/{tenantId}/v2.0`
   - Expiration check
8. Returns decoded claims: `oid`, `preferred_username`, `name`, `email`

**Dependencies:** `jsonwebtoken` (already installed), Node `crypto` (built-in). No new packages needed.

**Note on nonce validation:** Not required server-side. MSAL browser validates the nonce client-side before returning the ID token.

### New endpoint in: `server/routes/auth.js`

**`POST /api/auth/sso`**

Request body: `{ idToken: "eyJ..." }`

Logic:
1. Check `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` are set → 501 if not
2. Validate ID token via `azureAdToken.verify(idToken)` → 401 if invalid
3. Extract claims: `oid` (azure object ID), `preferred_username` or `email`, `name`
4. Look up student by `azure_id = oid`
5. If not found → create new student record:
   - Generate UUID for `id`
   - Set `display_name` from claims `name`
   - Set `email` from claims `preferred_username` or `email`
   - Set `azure_id` from claims `oid`
   - Assign to active term
   - Auto-complete "accepted" step (same as dev-login)
6. If found → update `display_name` and `email` from latest claims
7. Sign app JWT via existing `signToken(studentId, email)`
8. Return `{ token, student }`

**Error responses:**
- 501: Azure AD not configured
- 400: Missing idToken
- 401: Invalid or expired token
- 500: Server error

---

## 3. Login UI Changes

### Changes to: `client/src/components/PublicRoadmapPreview.jsx`

Consumes `useAuth()` directly for SSO state. Keeps `onLogin` prop for dev login.

**When Azure AD is configured (`isAzureAdConfigured === true`):**
- Show "Sign in with CSUB Account" button — prominent, CSUB blue, at top of login area
- Button disabled with loading spinner while `ssoLoading` is true (prevents double-click / interaction_in_progress errors)
- Below it, a subtle divider ("or")
- Below that, the dev login form (only if `VITE_ALLOW_DEV_LOGIN !== 'false'`)
- If login fails (user cancels, error), shows inline error message

**When Azure AD is NOT configured (`isAzureAdConfigured === false`):**
- Show the dev login form exactly as it is today
- No SSO button visible
- Zero visual change from current state

**No changes to AdminLogin** — admin auth stays email/password.

---

## 4. Environment & Configuration

### Client env vars (`client/.env`)

| Variable | Required for SSO | Description |
|----------|-----------------|-------------|
| `VITE_AZURE_AD_CLIENT_ID` | Yes | Azure AD app registration client ID |
| `VITE_AZURE_AD_TENANT_ID` | Yes | Azure AD tenant ID |
| `VITE_AZURE_AD_REDIRECT_URI` | No | OAuth redirect URI (default: `http://localhost:3000`) |
| `VITE_ALLOW_DEV_LOGIN` | No | Show dev login form (default: `true`) |

### Server env vars (`server/.env`)

| Variable | Required for SSO | Description |
|----------|-----------------|-------------|
| `AZURE_AD_CLIENT_ID` | Yes | Same client ID (for token audience validation) |
| `AZURE_AD_TENANT_ID` | Yes | Same tenant ID (for JWKS URL + issuer validation) |
| `ALLOW_DEV_LOGIN` | No | Allow `POST /api/auth/dev-login` endpoint (default: `true` in dev, `false` in prod) |

### Removed from server `.env.example`

- `AZURE_AD_CLIENT_SECRET` — not needed for SPA public client flow
- `AZURE_AD_REDIRECT_URI` — server does not handle OAuth callbacks in this flow

### Dual dev-login flags

Two separate flags control dev login at different layers:
- **Server:** `ALLOW_DEV_LOGIN` — gates whether the `/api/auth/dev-login` endpoint responds
- **Client:** `VITE_ALLOW_DEV_LOGIN` — controls whether the dev login form is rendered in the UI

**Production config:** Set both `ALLOW_DEV_LOGIN=false` (server) and `VITE_ALLOW_DEV_LOGIN=false` (client) to fully disable dev login.

### Feature flag logic

- **Azure AD enabled:** Both client and server have `CLIENT_ID` and `TENANT_ID` set
- **Dev login enabled:** `VITE_ALLOW_DEV_LOGIN !== 'false'` (client) + `ALLOW_DEV_LOGIN` (server)
- **Both can coexist** during development and testing
- **Production config:** Set Azure AD vars + disable dev login on both layers

### .env.example updates

- `server/.env.example` — remove `AZURE_AD_CLIENT_SECRET` and `AZURE_AD_REDIRECT_URI`, add `ALLOW_DEV_LOGIN`
- `client/.env.example` — add `VITE_ALLOW_DEV_LOGIN`

---

## 5. Files Changed

| File | Action | Description |
|------|--------|-------------|
| `client/src/auth/msalConfig.js` | New | MSAL configuration and instance |
| `client/src/auth/AuthProvider.jsx` | Modify | Add `ssoLogin()`, MSAL init, redirect handling, logout cleanup |
| `client/src/components/PublicRoadmapPreview.jsx` | Modify | Add SSO button with popup/redirect UX, consume `useAuth()` |
| `server/utils/azureAdToken.js` | New | Azure AD ID token validation with JWKS + cache-miss refresh |
| `server/routes/auth.js` | Modify | Add `POST /api/auth/sso` endpoint |
| `server/.env.example` | Modify | Remove `CLIENT_SECRET` and `REDIRECT_URI`, add `ALLOW_DEV_LOGIN` |
| `client/.env.example` | Modify | Add `VITE_ALLOW_DEV_LOGIN` |
| `docs/AUTH-ROADMAP.md` | Modify | Update to reflect implemented SSO |

---

## 6. Verification

1. **Without Azure AD vars set:** App behaves exactly as before. No SSO button visible. Dev login works.
2. **With Azure AD vars set:** SSO button appears. Clicking it opens Microsoft login popup. On success, student is logged in with JWT. Dev login still works if `VITE_ALLOW_DEV_LOGIN=true`.
3. **Popup blocked:** Falls back to redirect flow automatically.
4. **Double-click prevention:** SSO button disabled during login flow, re-enabled after completion or error.
5. **Invalid token:** Server returns 401, client shows error message.
6. **JWKS key rotation:** If Azure AD rotates keys, server re-fetches JWKS on cache miss.
7. **New student via SSO:** Student record auto-created with `azure_id`, assigned to active term, "accepted" step completed.
8. **Returning student via SSO:** Student record found by `azure_id`, name/email updated from latest claims.
9. **Logout:** Clears both app JWT and MSAL cache from sessionStorage.
10. **Production build:** `npm run build` succeeds.
