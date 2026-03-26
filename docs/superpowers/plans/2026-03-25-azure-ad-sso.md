# Azure AD SSO Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Azure AD SSO for student login using client-side MSAL popup + redirect fallback, disabled by default until env vars are configured.

**Architecture:** Client-side MSAL (`@azure/msal-browser`) handles the Microsoft login popup/redirect. The ID token is sent to a new server endpoint (`POST /api/auth/sso`) which validates it against Azure AD's JWKS public keys and issues an app JWT. When Azure AD env vars are absent, the app behaves exactly as it does today.

**Tech Stack:** `@azure/msal-browser` 5.4.0 (client, already installed), `jsonwebtoken` 9.0.3 (server, already installed), Node `crypto.createPublicKey` for JWK→PEM conversion.

**Spec:** `docs/superpowers/specs/2026-03-25-azure-ad-sso-design.md`

---

## Task 1: Create MSAL Configuration Module

**Files:**
- Create: `client/src/auth/msalConfig.js`

This module creates and exports the MSAL `PublicClientApplication` instance. If Azure AD env vars are missing, everything exports as null/false so no MSAL code runs.

- [ ] **Step 1: Create `client/src/auth/msalConfig.js`**

```js
import { PublicClientApplication } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID;
const tenantId = import.meta.env.VITE_AZURE_AD_TENANT_ID;
const redirectUri = import.meta.env.VITE_AZURE_AD_REDIRECT_URI || 'http://localhost:3000';

export const isAzureAdConfigured = !!(clientId && tenantId);

export const loginRequest = { scopes: ['openid', 'profile', 'email'] };

export const msalInstance = isAzureAdConfigured
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    })
  : null;
```

- [ ] **Step 2: Verify no build errors**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds (unused module is tree-shaken if env vars absent).

- [ ] **Step 3: Commit**

```bash
git add client/src/auth/msalConfig.js
git commit -m "feat(auth): add MSAL configuration module for Azure AD SSO"
```

---

## Task 2: Create Server-Side Azure AD Token Validator

**Files:**
- Create: `server/utils/azureAdToken.js`

Validates Azure AD ID tokens by fetching JWKS public keys, converting JWK→PEM, and verifying signature + claims. Caches keys with a 24h refresh and a cache-miss fallback for key rotation.

- [ ] **Step 1: Create `server/utils/azureAdToken.js`**

```js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const TENANT_ID = () => process.env.AZURE_AD_TENANT_ID;
const CLIENT_ID = () => process.env.AZURE_AD_CLIENT_ID;
const JWKS_REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedKeys = null;
let lastFetchTime = 0;

async function fetchJwks() {
  const tenantId = TENANT_ID();
  const url = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS: ${res.status}`);
  }
  const data = await res.json();
  cachedKeys = data.keys;
  lastFetchTime = Date.now();
  return cachedKeys;
}

async function getSigningKey(kid) {
  // Use cache if fresh
  if (cachedKeys && (Date.now() - lastFetchTime) < JWKS_REFRESH_MS) {
    const key = cachedKeys.find((k) => k.kid === kid);
    if (key) return key;
  }

  // Cache miss or stale — re-fetch (handles key rotation)
  const keys = await fetchJwks();
  const key = keys.find((k) => k.kid === kid);
  if (!key) {
    throw new Error(`Signing key not found for kid: ${kid}`);
  }
  return key;
}

function jwkToPem(jwk) {
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return publicKey.export({ type: 'spki', format: 'pem' });
}

export async function verifyAzureAdToken(idToken) {
  // Decode header to get kid
  const header = JSON.parse(
    Buffer.from(idToken.split('.')[0], 'base64url').toString()
  );

  const jwk = await getSigningKey(header.kid);
  const pem = jwkToPem(jwk);

  const tenantId = TENANT_ID();
  const clientId = CLIENT_ID();

  const decoded = jwt.verify(idToken, pem, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  });

  return {
    oid: decoded.oid,
    email: decoded.preferred_username || decoded.email,
    name: decoded.name,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/azureAdToken.js
git commit -m "feat(auth): add Azure AD ID token validator with JWKS caching"
```

---

## Task 3: Add SSO Endpoint to Server Auth Routes

**Files:**
- Modify: `server/routes/auth.js`

Adds `POST /api/auth/sso` which accepts `{ idToken }`, validates it, finds-or-creates a student by `azure_id`, and returns an app JWT + student object.

- [ ] **Step 1: Add the SSO endpoint to `server/routes/auth.js`**

Add this import at the top of the file (after existing imports on line 3):

```js
import { verifyAzureAdToken } from '../utils/azureAdToken.js';
```

Add this route block before the `GET /api/auth/me` route (before line 68):

```js
// POST /api/auth/sso - Azure AD SSO login
router.post('/sso', async (req, res, next) => {
  try {
    if (!process.env.AZURE_AD_CLIENT_ID || !process.env.AZURE_AD_TENANT_ID) {
      return res.status(501).json({ error: 'Azure AD SSO is not configured' });
    }

    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    let claims;
    try {
      claims = await verifyAzureAdToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { oid, email, name } = claims;

    // Find existing student by azure_id
    let student = await req.db.queryOne(
      'SELECT id, display_name, email FROM students WHERE azure_id = $1',
      [oid]
    );

    if (student) {
      // Update name/email from latest claims
      await req.db.execute(
        'UPDATE students SET display_name = $1, email = $2 WHERE id = $3',
        [name, email, student.id]
      );
      student.display_name = name;
      student.email = email;
    } else {
      // Create new student (uuidv4 is already imported at the top of auth.js)
      const studentId = uuidv4();
      const activeTerm = await req.db.queryOne(
        'SELECT id FROM terms WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
      );
      const termId = activeTerm?.id || null;

      await req.db.execute(
        `INSERT INTO students (id, display_name, email, azure_id, term_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [studentId, name, email, oid, termId]
      );

      // Auto-complete the accepted step
      const acceptedStep = await req.db.queryOne(
        `SELECT id FROM steps
         WHERE term_id = $1 AND step_key = 'accepted'
         ORDER BY id LIMIT 1`,
        [termId]
      );
      if (acceptedStep?.id) {
        await req.db.execute(
          `INSERT INTO student_progress (student_id, step_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [studentId, acceptedStep.id]
        );
      }

      student = { id: studentId, display_name: name, email };
    }

    const token = signToken(student.id, student.email);
    res.json({
      token,
      student: {
        id: student.id,
        displayName: student.display_name,
        email: student.email,
      },
    });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify server starts without errors**

Run: `cd server && node -e "import('./routes/auth.js').then(() => console.log('OK')).catch(e => console.error(e.message))"`
Expected: `OK` (the import succeeds; the module loads without errors)

- [ ] **Step 3: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat(auth): add POST /api/auth/sso endpoint for Azure AD login"
```

---

## Task 4: Add SSO Login to AuthProvider

**Files:**
- Modify: `client/src/auth/AuthProvider.jsx`

Adds MSAL initialization on mount, `ssoLogin()` with popup + redirect fallback, redirect response handling, and logout MSAL cache cleanup. Exposes `ssoLogin`, `ssoLoading`, `ssoError`, and `isAzureAdConfigured` on context.

- [ ] **Step 1: Rewrite `client/src/auth/AuthProvider.jsx`**

Replace the entire file with:

```jsx
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { msalInstance, isAzureAdConfigured, loginRequest } from './msalConfig';
import { BrowserAuthError } from '@azure/msal-browser';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

async function sendIdTokenToServer(idToken) {
  const res = await fetch('/api/auth/sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'SSO login failed');
  }
  return res.json();
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem('csub_token'));
  const [loading, setLoading] = useState(true);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState('');
  const msalReady = useRef(false);
  const redirecting = useRef(false);

  // Shared handler for SSO responses (popup or redirect)
  const handleSsoResponse = useCallback(async (idToken) => {
    const data = await sendIdTokenToServer(idToken);
    sessionStorage.setItem('csub_token', data.token);
    setToken(data.token);
    setUser(data.student);
  }, []);

  // On mount: initialize MSAL, handle redirect, then validate existing token
  useEffect(() => {
    async function init() {
      // Step 1: Initialize MSAL and handle redirect response (if any)
      if (isAzureAdConfigured && msalInstance) {
        try {
          await msalInstance.initialize();
          msalReady.current = true;
          const redirectResponse = await msalInstance.handleRedirectPromise();
          if (redirectResponse?.idToken) {
            await handleSsoResponse(redirectResponse.idToken);
            setLoading(false);
            return; // Redirect login succeeded — skip /me check
          }
        } catch {
          // MSAL init or redirect handling failed — continue to normal flow
        }
      }

      // Step 2: Validate existing token via /api/auth/me
      const existingToken = sessionStorage.getItem('csub_token');
      if (existingToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${existingToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data);
          } else {
            sessionStorage.removeItem('csub_token');
            setToken(null);
          }
        } catch {
          // Server unavailable
        }
      }
      setLoading(false);
    }
    init();
  }, [handleSsoResponse]);

  // SSO login — popup with redirect fallback
  const ssoLogin = useCallback(async () => {
    if (!msalInstance || !msalReady.current) return;
    setSsoLoading(true);
    setSsoError('');
    try {
      let response;
      try {
        response = await msalInstance.loginPopup(loginRequest);
      } catch (err) {
        // Popup blocked/failed — fall back to redirect
        if (
          err instanceof BrowserAuthError &&
          ['popup_window_error', 'empty_window_error', 'popup_timeout'].includes(err.errorCode)
        ) {
          redirecting.current = true;
          await msalInstance.loginRedirect(loginRequest);
          return; // Page will redirect — no further action
        }
        throw err; // Re-throw non-popup errors (e.g., user cancelled)
      }
      if (response?.idToken) {
        await handleSsoResponse(response.idToken);
      }
    } catch (err) {
      if (err.errorCode === 'user_cancelled') {
        setSsoError('');
      } else {
        setSsoError(err.message || 'SSO login failed');
      }
    } finally {
      if (!redirecting.current) setSsoLoading(false);
    }
  }, [handleSsoResponse]);

  // Dev login — accepts name + email, gets JWT from server
  const devLogin = useCallback(async (name, email) => {
    const res = await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    if (!res.ok) {
      throw new Error('Login failed');
    }
    const data = await res.json();
    sessionStorage.setItem('csub_token', data.token);
    setToken(data.token);
    setUser(data.student);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('csub_token');
    setToken(null);
    setUser(null);
    // Clear MSAL cache to prevent stale Azure AD tokens
    if (isAzureAdConfigured && msalInstance && msalReady.current) {
      msalInstance.clearCache();
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        devLogin,
        logout,
        isAuthenticated: !!token,
        ssoLogin,
        ssoLoading,
        ssoError,
        isAzureAdConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 2: Verify no build errors**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/auth/AuthProvider.jsx
git commit -m "feat(auth): add SSO login, MSAL init, and redirect handling to AuthProvider"
```

---

## Task 5: Add SSO Button to Login UI

**Files:**
- Modify: `client/src/components/PublicRoadmapPreview.jsx`

When Azure AD is configured, shows a "Sign in with CSUB Account" button above the dev login form (separated by an "or" divider). When not configured, renders identically to today.

- [ ] **Step 1: Update `PublicRoadmapPreview.jsx`**

Add the `useAuth` import at line 1 (alongside existing imports):

```jsx
import { useAuth } from '../auth/AuthProvider';
```

Inside the component function (line 7), destructure SSO state from auth context:

```jsx
export default function PublicRoadmapPreview({ onLogin }) {
  const { ssoLogin, ssoLoading, ssoError, isAzureAdConfigured } = useAuth();
```

Replace the `loginForm` definition (currently lines 59–101) with:

```jsx
  const devLoginForm = (
    <form onSubmit={handleLogin} className="flex flex-wrap items-end gap-3" aria-describedby={loginError ? 'login-error' : undefined}>
      <div className="flex-1 min-w-[120px]">
        <label htmlFor="login-name" className="block font-body text-xs font-semibold text-csub-blue-dark/70 mb-1">Name</label>
        <input
          id="login-name"
          type="text"
          required
          value={loginName}
          onChange={(e) => setLoginName(e.target.value)}
          placeholder="Jane Doe"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label htmlFor="login-email" className="block font-body text-xs font-semibold text-csub-blue-dark/70 mb-1">Email</label>
        <input
          id="login-email"
          type="email"
          required
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          placeholder="jdoe@csub.edu"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
        />
      </div>
      <button
        type="submit"
        disabled={loggingIn}
        className="px-5 py-2 bg-csub-blue hover:bg-csub-blue-dark text-white rounded-lg font-body text-sm font-semibold transition-colors duration-200 disabled:opacity-50 whitespace-nowrap"
      >
        {loggingIn ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );

  const showDevLogin = import.meta.env.VITE_ALLOW_DEV_LOGIN !== 'false';

  const loginForm = (
    <div className="ml-12 sm:ml-14 my-4 p-4 bg-csub-blue/5 rounded-xl border border-csub-blue/10">
      <p className="font-body text-sm font-semibold text-csub-blue-dark mb-3">
        {isAzureAdConfigured
          ? 'Sign in with your CSUB account to track your progress.'
          : 'Activated your CSUB account? Sign in to track your progress.'}
      </p>

      {/* SSO Button — only when Azure AD is configured */}
      {isAzureAdConfigured && (
        <>
          <button
            type="button"
            onClick={ssoLogin}
            disabled={ssoLoading}
            className="w-full px-5 py-3 bg-csub-blue hover:bg-csub-blue-dark text-white rounded-lg font-body text-sm font-bold transition-colors duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {ssoLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                Signing in...
              </>
            ) : (
              'Sign in with CSUB Account'
            )}
          </button>
          {ssoError && (
            <p role="alert" className="text-red-600 text-sm font-body mt-2">{ssoError}</p>
          )}
        </>
      )}

      {/* Divider — shown when both SSO and dev login are visible */}
      {isAzureAdConfigured && showDevLogin && (
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs font-body text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

      {/* Dev login form */}
      {showDevLogin && (
        <>
          {devLoginForm}
          {loginError && (
            <p id="login-error" role="alert" className="text-red-600 text-sm font-body mt-2">{loginError}</p>
          )}
        </>
      )}
    </div>
  );
```

No other changes to this file. The `loginForm` variable is referenced in the JSX return in three places and continues to work as before.

**Note:** No changes to `client/src/App.jsx` are needed. The existing `onLogin={devLogin}` prop wiring continues to work; `PublicRoadmapPreview` uses `useAuth()` directly for SSO state.

- [ ] **Step 2: Verify no build errors**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PublicRoadmapPreview.jsx
git commit -m "feat(auth): add SSO button to public login UI with dev-login toggle"
```

---

## Task 6: Update Environment Variable Examples

**Files:**
- Modify: `server/.env.example`
- Modify: `client/.env.example`

Per spec Section 4: remove unused `AZURE_AD_CLIENT_SECRET` and `AZURE_AD_REDIRECT_URI` from server, add `ALLOW_DEV_LOGIN` to server, add `VITE_ALLOW_DEV_LOGIN` to client.

- [ ] **Step 1: Update `server/.env.example`**

Replace the Azure AD section with:

```
# Azure AD Configuration (for SSO — leave unset to disable)
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_TENANT_ID=your-tenant-id

# Dev Login (set to 'false' in production to disable dev login endpoint)
ALLOW_DEV_LOGIN=true
```

Remove these two lines entirely:
- `AZURE_AD_CLIENT_SECRET=your-client-secret`
- `AZURE_AD_REDIRECT_URI=http://localhost:3001/api/auth/callback`

- [ ] **Step 2: Update `client/.env.example`**

Add after the existing lines:

```
# Dev Login UI (set to 'false' to hide the dev login form)
VITE_ALLOW_DEV_LOGIN=true
```

- [ ] **Step 3: Commit**

```bash
git add server/.env.example client/.env.example
git commit -m "chore: update .env.example files for Azure AD SSO and dev-login flags"
```

---

## Task 7: Update Auth Roadmap Documentation

**Files:**
- Modify: `docs/AUTH-ROADMAP.md`

Update to reflect that SSO is now implemented (but disabled until env vars are set), and update the production security checklist.

- [ ] **Step 1: Update `docs/AUTH-ROADMAP.md`**

In the "What's Stubbed for Azure AD SSO" section, rename to "Azure AD SSO (Implemented — Disabled by Default)" and update the description to explain the implementation:
- Client: MSAL popup + redirect fallback in `AuthProvider.jsx`, SSO button in `PublicRoadmapPreview.jsx`
- Server: `POST /api/auth/sso` validates ID tokens via JWKS in `azureAdToken.js`
- Enabled by setting `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` on both client and server

Update the server `.env.example` code block to remove `CLIENT_SECRET` and `REDIRECT_URI`, and show the new `ALLOW_DEV_LOGIN` flag.

In "What's Needed for Production", change section 1 from implementation tasks to activation tasks:
- Register app in Azure AD portal
- Set `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` in both client and server env
- Set `VITE_AZURE_AD_REDIRECT_URI` to production URL
- Set `ALLOW_DEV_LOGIN=false` and `VITE_ALLOW_DEV_LOGIN=false`

- [ ] **Step 2: Commit**

```bash
git add docs/AUTH-ROADMAP.md
git commit -m "docs: update auth roadmap to reflect implemented SSO integration"
```

---

## Task 8: Production Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full production build**

Run: `cd /Users/aburt1/Desktop/roadmap/CSUB-admissions && npm run build`
Expected: Build completes successfully with no errors.

- [ ] **Step 2: Start dev server and verify no errors**

Run: `npm run dev`
Verify: Server starts on :3001, client starts on :3000, no startup errors.

- [ ] **Step 3: Verify without Azure AD vars — no SSO button visible**

Navigate to `http://localhost:3000`. The login page should show only the dev login form, no SSO button. Behavior is identical to before this change.

- [ ] **Step 4: Final commit (if any build fixes were needed)**

Only commit if fixes were required during verification.
