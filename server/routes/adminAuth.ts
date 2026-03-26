import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminAuth } from '../middleware/adminAuth.js';
import { verifyAzureAdToken } from '../utils/azureAdToken.js';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import type { AdminUser } from '../types/models.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-secure-random-string';

interface AdminJwtPayload {
  adminId: number | string;
  role: string;
  email: string;
  displayName: string;
}

const breakGlassLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

function constantTimeCompare(a: string, b: string): boolean {
  const key = crypto.randomBytes(32);
  const hmacA = crypto.createHmac('sha256', key).update(a).digest();
  const hmacB = crypto.createHmac('sha256', key).update(b).digest();
  return crypto.timingSafeEqual(hmacA, hmacB);
}

// POST /api/admin/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await req.db.queryOne<AdminUser>(
      'SELECT * FROM admin_users WHERE email = $1 AND is_active = 1',
      [email.toLowerCase().trim()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload: AdminJwtPayload = {
      adminId: user.id,
      role: user.role,
      email: user.email,
      displayName: user.display_name,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/admin/auth/me — requires auth
router.get('/me', adminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await req.db.queryOne<{ id: number; email: string; display_name: string; role: string; created_at: string }>(
      'SELECT id, email, display_name, role, created_at FROM admin_users WHERE id = $1',
      [req.adminUser!.id]
    );

    if (!user) {
      return res.json({ user: req.adminUser });
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/admin/auth/change-password — requires auth
router.post('/change-password', adminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await req.db.queryOne<AdminUser>(
      'SELECT * FROM admin_users WHERE id = $1',
      [req.adminUser!.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await req.db.execute('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [hash, user.id]);

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/admin/auth/sso — Azure AD SSO login for admins
router.post('/sso', async (req: Request, res: Response, next: NextFunction) => {
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
    let claims: { oid: string; email: string | undefined; name: string | undefined };
    try {
      claims = await verifyAzureAdToken(idToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { oid, email: claimsEmail, name: claimsName } = claims;
    const email = claimsEmail || '';
    const name = claimsName || '';

    // Look up admin by azure_id first, then by email
    let admin = await req.db.queryOne<AdminUser>(
      'SELECT * FROM admin_users WHERE azure_id = $1',
      [oid]
    );

    if (!admin && email) {
      admin = await req.db.queryOne<AdminUser>(
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

    const payload: AdminJwtPayload = {
      adminId: admin.id,
      role: admin.role,
      email: admin.email,
      displayName: name || admin.display_name,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

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

// POST /api/admin/auth/local-login — break-glass local admin login
router.post('/local-login', breakGlassLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

    const payload: AdminJwtPayload = {
      adminId: 'break-glass',
      role: 'sysadmin',
      email: 'break-glass',
      displayName: 'Break Glass Admin',
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

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

export default router;
