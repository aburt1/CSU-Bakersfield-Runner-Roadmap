# Admin Azure AD SSO & Break-Glass Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Azure AD SSO to the admin portal and add a hidden break-glass local login at `/admin/local-login` that bypasses the database entirely.

**Architecture:** Reuses the existing MSAL client instance (`msalConfig.js`) and server-side token validation (`azureAdToken.js`) from student SSO. Admin SSO authenticates via Azure AD but authorizes against `admin_users` table (no auto-creation). Break-glass is a separate, database-independent endpoint gated by env vars.

**Tech Stack:** React 18, MSAL Browser v5, Express 4, express-rate-limit v7, jsonwebtoken, Node crypto (HMAC for timing-safe comparison)

**Spec:** `docs/superpowers/specs/2026-03-25-admin-sso-design.md`

**Note:** The spec incorrectly states endpoint paths as `/api/admin-auth/...`. The actual server mount point is `/api/admin/auth` (see `server/index.js:73`), so all endpoints use `/api/admin/auth/...` in this plan.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `server/db/init.js` | Modify | Add `azure_id` column migration to `admin_users` |
| `server/routes/adminAuth.js` | Modify | Add `POST /sso` and `POST /local-login` endpoints |
| `server/routes/admin.js` | Modify | Make `password` optional on `POST /users` when Azure AD configured |
| `server/.env.example` | Modify | Add break-glass env vars |
| `client/src/pages/admin/AdminLogin.jsx` | Modify | Add SSO button with MSAL init/popup/redirect |
| `client/src/pages/admin/AdminLocalLogin.jsx` | Create | Break-glass username/password login page |
| `client/src/pages/admin/AdminUsersTab.jsx` | Modify | Hide password field when Azure AD configured |
| `client/src/pages/admin/AdminPage.jsx` | Modify | Import `isAzureAdConfigured` (prep for future use) |
| `client/src/main.jsx` | Modify | Add `/admin/local-login` route |
| `docs/AUTH-ROADMAP.md` | Modify | Update auth status documentation |

---

### Task 1: Database Migration — Add `azure_id` to `admin_users`

**Files:**
- Modify: `server/db/init.js:57-84` (migrations array)

- [ ] **Step 1: Add migration entry**

In `server/db/init.js`, add to the end of the `migrations` array (after the last entry around line 83):

```javascript
    'ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS azure_id TEXT UNIQUE',
```

This adds a nullable `azure_id` column with a `UNIQUE` constraint. The constraint is table-scoped — it does not conflict with the `students.azure_id` column. An Azure AD user may legitimately appear in both tables with the same `oid`.

- [ ] **Step 2: Verify migration runs**

Run: `cd server && node -e "import('./db/init.js').then(m => m.default()).then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"`

Expected: "OK" printed, no errors. If the app is running, you can also restart the server and check the logs for migration success.

- [ ] **Step 3: Commit**

```bash
git add server/db/init.js
git commit -m "feat: add azure_id column migration to admin_users table"
```

---

### Task 2: Break-Glass Local Login Endpoint

**Files:**
- Modify: `server/routes/adminAuth.js`

- [ ] **Step 1: Add imports and rate limiter**

At the top of `server/routes/adminAuth.js`, add these imports after the existing ones (after line 4):

```javascript
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

const breakGlassLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});
```

- [ ] **Step 2: Add the constant-time comparison helper**

Below the `breakGlassLimiter`, add:

```javascript
function constantTimeCompare(a, b) {
  const key = crypto.randomBytes(32);
  const hmacA = crypto.createHmac('sha256', key).update(a).digest();
  const hmacB = crypto.createHmac('sha256', key).update(b).digest();
  return crypto.timingSafeEqual(hmacA, hmacB);
}
```

This produces equal-length HMAC digests regardless of input lengths, preventing the `TypeError` that `timingSafeEqual` throws on mismatched buffer lengths.

- [ ] **Step 3: Add the POST /local-login endpoint**

Before the `export default router;` line (before line 100), add:

```javascript
// POST /api/admin/auth/local-login — break-glass local admin login
router.post('/local-login', breakGlassLimiter, async (req, res, next) => {
  const bgUsername = process.env.ADMIN_BREAK_GLASS_USERNAME;
  const bgPassword = process.env.ADMIN_BREAK_GLASS_PASSWORD;

  // If env vars aren't set, this endpoint doesn't exist
  if (!bgUsername || !bgPassword) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const usernameMatch = constantTimeCompare(username, bgUsername);
    const passwordMatch = constantTimeCompare(password, bgPassword);

    // Best-effort audit logging
    try {
      await req.db.execute(
        `INSERT INTO audit_log (entity_type, entity_id, action, details, performed_by, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'break-glass',
          0,
          usernameMatch && passwordMatch ? 'break_glass_login_success' : 'break_glass_login_failure',
          JSON.stringify({ timestamp: new Date().toISOString() }),
          'break-glass',
          req.ip,
        ]
      );
    } catch {
      // Audit log failure must not block break-glass auth
    }

    if (!usernameMatch || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        adminId: 'break-glass',
        role: 'sysadmin',
        email: 'break-glass',
        displayName: 'Break Glass Admin',
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: 'break-glass',
        email: 'break-glass',
        displayName: 'Break Glass Admin',
        role: 'sysadmin',
      },
    });
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Verify the endpoint**

Start the server. Test without env vars set:

Run: `curl -s -X POST http://localhost:3001/api/admin/auth/local-login -H "Content-Type: application/json" -d '{"username":"test","password":"test"}'`

Expected: `{"error":"Not found"}` with HTTP 404.

Now set env vars temporarily and test:

Run: `ADMIN_BREAK_GLASS_USERNAME=testadmin ADMIN_BREAK_GLASS_PASSWORD=testpass123 node server/index.js &`

Then: `curl -s -X POST http://localhost:3001/api/admin/auth/local-login -H "Content-Type: application/json" -d '{"username":"testadmin","password":"testpass123"}'`

Expected: JSON with `token` and `user` fields, `user.role: "sysadmin"`.

Then test wrong credentials:

Run: `curl -s -X POST http://localhost:3001/api/admin/auth/local-login -H "Content-Type: application/json" -d '{"username":"wrong","password":"wrong"}'`

Expected: `{"error":"Invalid credentials"}` with HTTP 401.

- [ ] **Step 5: Commit**

```bash
git add server/routes/adminAuth.js
git commit -m "feat: add break-glass local admin login endpoint

Database-independent emergency login gated by ADMIN_BREAK_GLASS_USERNAME
and ADMIN_BREAK_GLASS_PASSWORD env vars. Returns 404 when not configured.
Includes constant-time HMAC comparison, rate limiting, and audit logging."
```

---

### Task 3: Admin SSO Endpoint

**Files:**
- Modify: `server/routes/adminAuth.js`

- [ ] **Step 1: Add the verifyAzureAdToken import**

At the top of `server/routes/adminAuth.js`, add after the existing imports:

```javascript
import { verifyAzureAdToken } from '../utils/azureAdToken.js';
```

- [ ] **Step 2: Add the POST /sso endpoint**

Before the break-glass endpoint (before the `// POST /api/admin/auth/local-login` comment), add:

```javascript
// POST /api/admin/auth/sso — Azure AD SSO login for admins
router.post('/sso', async (req, res, next) => {
  const azureClientId = process.env.AZURE_AD_CLIENT_ID;
  const azureTenantId = process.env.AZURE_AD_TENANT_ID;

  if (!azureClientId || !azureTenantId) {
    return res.status(501).json({ error: 'Azure AD is not configured' });
  }

  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    // Validate the Azure AD ID token
    let claims;
    try {
      claims = await verifyAzureAdToken(idToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { oid, email, name } = claims;

    // Look up admin by azure_id first, then by email
    let admin = await req.db.queryOne(
      'SELECT * FROM admin_users WHERE azure_id = $1',
      [oid]
    );

    if (!admin && email) {
      admin = await req.db.queryOne(
        'SELECT * FROM admin_users WHERE LOWER(email) = LOWER($1)',
        [email]
      );
    }

    if (!admin) {
      return res.status(403).json({ error: 'No admin account found. Contact your system administrator.' });
    }

    // Check active status BEFORE linking azure_id
    if (!admin.is_active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Link azure_id on first SSO login (found by email)
    if (!admin.azure_id) {
      await req.db.execute(
        'UPDATE admin_users SET azure_id = $1 WHERE id = $2',
        [oid, admin.id]
      );
    }

    // Update display name from latest claims
    if (name && name !== admin.display_name) {
      await req.db.execute(
        'UPDATE admin_users SET display_name = $1 WHERE id = $2',
        [name, admin.id]
      );
    }

    const token = jwt.sign(
      {
        adminId: admin.id,
        role: admin.role,
        email: admin.email,
        displayName: name || admin.display_name,
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: admin.id,
        email: admin.email,
        displayName: name || admin.display_name,
        role: admin.role,
      },
    });
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Verify the endpoint returns 501 when Azure AD not configured**

Run: `curl -s -X POST http://localhost:3001/api/admin/auth/sso -H "Content-Type: application/json" -d '{"idToken":"fake"}'`

Expected: `{"error":"Azure AD is not configured"}` with HTTP 501 (assuming `AZURE_AD_CLIENT_ID` / `AZURE_AD_TENANT_ID` are not set in dev).

- [ ] **Step 4: Commit**

```bash
git add server/routes/adminAuth.js
git commit -m "feat: add admin SSO endpoint for Azure AD authentication

Validates Azure AD ID token, looks up admin by azure_id or email,
links azure_id on first SSO login. No auto-creation - admins must
be pre-created in the Users tab."
```

---

### Task 4: Make Password Optional on Admin User Create

**Files:**
- Modify: `server/routes/admin.js:1527-1559`

- [ ] **Step 1: Update the POST /users validation and password handling**

In `server/routes/admin.js`, find the `POST /users` handler at line 1527. Replace lines 1529-1543:

```javascript
    const { email, password, role, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'email, password, and displayName required' });
    }
    const validRoles = ['viewer', 'admissions', 'admissions_editor', 'sysadmin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const existing = await req.db.queryOne('SELECT id FROM admin_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
```

with:

```javascript
    const { email, password, role, displayName } = req.body;
    const azureAdConfigured = !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_TENANT_ID);

    if (!email || !displayName) {
      return res.status(400).json({ error: 'email and displayName required' });
    }
    if (!azureAdConfigured && !password) {
      return res.status(400).json({ error: 'email, password, and displayName required' });
    }
    const validRoles = ['viewer', 'admissions', 'admissions_editor', 'sysadmin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const existing = await req.db.queryOne('SELECT id FROM admin_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // When Azure AD is configured and no password provided, generate an unusable random hash
    const hashSource = password || crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(hashSource, 10);
```

- [ ] **Step 2: Add crypto import if not present**

Check if `crypto` is already imported in `admin.js`. If not, add at the top of the file:

```javascript
import crypto from 'crypto';
```

- [ ] **Step 3: Verify**

Test creating a user without a password when `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` are set:

Run: `curl -s -X POST http://localhost:3001/api/admin/users -H "Content-Type: application/json" -H "Authorization: Bearer <admin-token>" -d '{"email":"test@csub.edu","displayName":"Test User","role":"viewer"}'`

Expected: `{"success":true,"id":<number>}` — user created with random password hash.

Test without Azure AD env vars — password should still be required:

Expected: `{"error":"email, password, and displayName required"}` with HTTP 400.

- [ ] **Step 4: Commit**

```bash
git add server/routes/admin.js
git commit -m "feat: make password optional on admin user create when Azure AD configured

When AZURE_AD_CLIENT_ID and AZURE_AD_TENANT_ID are set, admin users can
be created without a password (SSO-only). Generates an unusable random
password hash for the NOT NULL constraint."
```

---

### Task 5: Admin Login UI — SSO Button

**Files:**
- Modify: `client/src/pages/admin/AdminLogin.jsx`

- [ ] **Step 1: Rewrite AdminLogin.jsx with SSO support**

Replace the entire contents of `client/src/pages/admin/AdminLogin.jsx` with:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { isAzureAdConfigured, msalInstance, loginRequest } from '../../auth/msalConfig';
import { BrowserAuthError } from '@azure/msal-browser';

async function sendIdTokenToServer(idToken) {
  const res = await fetch('/api/admin/auth/sso', {
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

export default function AdminLogin({ onLogin }) {
  // Email/password state (used when Azure AD not configured)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // SSO state
  const [ssoLoading, setSsoLoading] = useState(false);
  const [msalInitialized, setMsalInitialized] = useState(false);
  const msalReady = useRef(false);
  const redirecting = useRef(false);

  // Handle SSO response (popup or redirect)
  const handleSsoResponse = useCallback(async (idToken) => {
    const data = await sendIdTokenToServer(idToken);
    onLogin(data.token, data.user);
  }, [onLogin]);

  // Initialize MSAL on mount
  useEffect(() => {
    if (!isAzureAdConfigured || !msalInstance) {
      setMsalInitialized(true);
      return;
    }

    async function init() {
      try {
        await msalInstance.initialize();
        msalReady.current = true;

        const redirectResponse = await msalInstance.handleRedirectPromise();
        if (redirectResponse?.idToken) {
          setSsoLoading(true);
          await handleSsoResponse(redirectResponse.idToken);
          return; // Redirect login succeeded
        }
      } catch (err) {
        setError(err.message || 'SSO initialization failed');
      }
      setMsalInitialized(true);
    }
    init();
  }, [handleSsoResponse]);

  // SSO login — popup with redirect fallback
  const handleSsoLogin = async () => {
    if (!msalInstance || !msalReady.current) return;
    setSsoLoading(true);
    setError('');
    try {
      let response;
      try {
        response = await msalInstance.loginPopup(loginRequest);
      } catch (err) {
        if (
          err instanceof BrowserAuthError &&
          ['popup_window_error', 'empty_window_error', 'popup_timeout'].includes(err.errorCode)
        ) {
          redirecting.current = true;
          await msalInstance.loginRedirect(loginRequest);
          return;
        }
        throw err;
      }
      if (response?.idToken) {
        await handleSsoResponse(response.idToken);
      }
    } catch (err) {
      if (err.errorCode === 'user_cancelled') {
        setError('');
      } else {
        setError(err.message || 'SSO login failed');
      }
    } finally {
      if (!redirecting.current) setSsoLoading(false);
    }
  };

  // Email/password login (when Azure AD not configured)
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        onLogin(data.token, data.user);
      } else {
        setError(data.error || 'Invalid credentials.');
      }
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-sm w-full mx-auto px-6">
        <h1 className="font-display text-2xl font-bold text-csub-blue-dark uppercase tracking-wide mb-2 text-center">
          Admin Portal
        </h1>
        <p className="font-body text-csub-gray text-sm mb-6 text-center">
          {isAzureAdConfigured
            ? 'Sign in with your CSUB account.'
            : 'Sign in with your admin credentials.'}
        </p>

        {isAzureAdConfigured ? (
          /* SSO login */
          <div className="space-y-4">
            <button
              onClick={handleSsoLogin}
              disabled={ssoLoading || !msalInitialized}
              className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-3 rounded-lg shadow transition-colors duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {ssoLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign in with CSUB Account'
              )}
            </button>
            {error && <p className="text-red-600 text-sm font-body text-center">{error}</p>}
          </div>
        ) : (
          /* Email/password login */
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
            />
            {error && <p className="text-red-600 text-sm font-body">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-3 rounded-lg shadow transition-colors duration-200 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify without Azure AD vars**

Start the client (`npm run dev` from `client/`). Navigate to `/admin`. You should see the email/password form exactly as before — zero visual change.

- [ ] **Step 3: Verify with Azure AD vars**

Set `VITE_AZURE_AD_CLIENT_ID` and `VITE_AZURE_AD_TENANT_ID` in `client/.env.local` and restart the dev server. Navigate to `/admin`. You should see only the "Sign in with CSUB Account" button — no email/password fields.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/AdminLogin.jsx
git commit -m "feat: add Azure AD SSO login to admin portal

Shows SSO button when Azure AD is configured, email/password form when not.
MSAL popup with redirect fallback, same pattern as student SSO."
```

---

### Task 6: Break-Glass Local Login Page

**Files:**
- Create: `client/src/pages/admin/AdminLocalLogin.jsx`
- Modify: `client/src/main.jsx`

- [ ] **Step 1: Create AdminLocalLogin.jsx**

Create `client/src/pages/admin/AdminLocalLogin.jsx`:

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminLocalLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        sessionStorage.setItem('csub_admin_token', data.token);
        sessionStorage.setItem('csub_admin_user', JSON.stringify(data.user));
        navigate('/admin');
      } else {
        setError(data.error || 'Invalid credentials.');
      }
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-sm w-full mx-auto px-6">
        <h1 className="font-display text-2xl font-bold text-csub-blue-dark uppercase tracking-wide mb-2 text-center">
          Local Admin Login
        </h1>
        <p className="font-body text-csub-gray text-sm mb-6 text-center">
          Emergency access only.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
          />
          {error && <p className="text-red-600 text-sm font-body">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-3 rounded-lg shadow transition-colors duration-200 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route in main.jsx**

In `client/src/main.jsx`, add the import after line 6:

```javascript
import AdminLocalLogin from './pages/admin/AdminLocalLogin';
```

Then add the route as a sibling to the existing `/admin` route (after line 20):

```jsx
      <Route path="/admin/local-login" element={<AdminLocalLogin />} />
```

**Important:** This route must NOT be wrapped in `AuthProvider`. It manages its own state and writes directly to `sessionStorage` before navigating to `/admin`.

- [ ] **Step 3: Verify**

Navigate to `http://localhost:3000/admin/local-login`. You should see a "Local Admin Login" page with username/password fields.

Verify there is NO link to this page from `/admin` or anywhere else in the app.

If break-glass env vars are set on the server, test logging in — on success it should redirect to `/admin` with the admin dashboard visible.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/AdminLocalLogin.jsx client/src/main.jsx
git commit -m "feat: add break-glass local admin login page at /admin/local-login

Standalone page for emergency admin access. Not linked from anywhere
in the app. Writes to sessionStorage and navigates to /admin on success."
```

---

### Task 7: Admin Users Tab — Hide Password When SSO Configured

**Files:**
- Modify: `client/src/pages/admin/AdminUsersTab.jsx`

- [ ] **Step 1: Add msalConfig import**

At the top of `client/src/pages/admin/AdminUsersTab.jsx`, add after the existing imports (after line 2):

```javascript
import { isAzureAdConfigured } from '../../auth/msalConfig';
```

- [ ] **Step 2: Conditionally render the password field**

In `AdminUsersTab.jsx`, find the password input (lines 103-110):

```jsx
            <input
              type="password"
              required={!editingId}
              placeholder={editingId ? 'New password (leave blank to keep)' : 'Password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
            />
```

Replace with:

```jsx
            {!isAzureAdConfigured && (
              <input
                type="password"
                required={!editingId}
                placeholder={editingId ? 'New password (leave blank to keep)' : 'Password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue"
              />
            )}
```

- [ ] **Step 3: Verify**

Without Azure AD vars: navigate to `/admin` → Users tab → click "New User". Password field should be visible and required.

With Azure AD vars set in client `.env.local`: same flow. Password field should be hidden. Creating a user with just name, email, and role should succeed.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/AdminUsersTab.jsx
git commit -m "feat: hide password field in admin Users tab when Azure AD configured

SSO-only admin users don't need passwords. The server generates an
unusable random password hash for the NOT NULL constraint."
```

---

### Task 8: AdminPage.jsx — Import msalConfig

**Files:**
- Modify: `client/src/pages/admin/AdminPage.jsx:1`

- [ ] **Step 1: Add isAzureAdConfigured import**

At the top of `client/src/pages/admin/AdminPage.jsx`, add after line 1 (after `import { useState, useEffect } from 'react';`):

```javascript
import { isAzureAdConfigured } from '../../auth/msalConfig';
```

This import is not consumed yet in `AdminPage` itself but makes it available for future admin SSO enhancements (e.g., clearing MSAL cache on logout). The main consumers are `AdminLogin.jsx` and `AdminUsersTab.jsx` which import it directly.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/admin/AdminPage.jsx
git commit -m "feat: import isAzureAdConfigured in AdminPage for future SSO use"
```

---

### Task 9: Environment & Documentation Updates

**Files:**
- Modify: `server/.env.example`
- Modify: `docs/AUTH-ROADMAP.md`

- [ ] **Step 1: Update server/.env.example**

Add after the `ADMIN_API_KEY` line (after line 16):

```
# Break-Glass Admin Login (both must be set to enable /admin/local-login)
ADMIN_BREAK_GLASS_USERNAME=
ADMIN_BREAK_GLASS_PASSWORD=
```

- [ ] **Step 2: Update docs/AUTH-ROADMAP.md**

Update the auth roadmap to reflect that admin SSO and break-glass login are now implemented (disabled). Add a section describing:

- Admin SSO: Azure AD authentication with app-managed roles, same MSAL config as student SSO
- Break-glass: Hidden local login at `/admin/local-login`, gated by env vars
- Admin user creation: Password optional when Azure AD configured
- Account linking: First SSO login matches by email, links `azure_id`

- [ ] **Step 3: Commit**

```bash
git add server/.env.example docs/AUTH-ROADMAP.md
git commit -m "docs: update env example and auth roadmap for admin SSO"
```

---

### Task 10: Verification Pass

- [ ] **Step 1: Full verification without Azure AD vars**

Start both server and client with no Azure AD env vars set.

1. Navigate to `/admin` — should show email/password form (unchanged from before)
2. Log in with `admin@csub.edu` / `admin123` — should work
3. Navigate to Users tab — password field should be visible on create form
4. Navigate to `/admin/local-login` — should show username/password form
5. Submit to `/api/admin/auth/local-login` — should return 404 (no env vars)
6. Verify no link to `/admin/local-login` exists anywhere in the UI

- [ ] **Step 2: Full verification with break-glass env vars**

Restart server with `ADMIN_BREAK_GLASS_USERNAME=emergadmin` and `ADMIN_BREAK_GLASS_PASSWORD=securepass123` set.

1. Navigate to `/admin/local-login`
2. Submit correct credentials — should redirect to `/admin` with sysadmin access
3. Submit wrong credentials — should show "Invalid credentials"

- [ ] **Step 3: Verify break-glass rate limiting**

With break-glass env vars set, send 6 consecutive requests with wrong credentials:

Run: `for i in {1..6}; do echo "Attempt $i:"; curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/admin/auth/local-login -H "Content-Type: application/json" -d '{"username":"wrong","password":"wrong"}'; echo; done`

Expected: First 5 attempts return 401, 6th returns 429. Counter does not reset on success — even a correct 6th attempt would return 429.

- [ ] **Step 4: Build check**

Run: `cd client && npm run build`

Expected: Build succeeds with no errors.

Run: `cd server && node -e "import('./index.js')" 2>&1 | head -5`

Expected: Server starts without import errors.

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during admin SSO verification"
```
