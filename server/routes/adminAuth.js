import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminAuth } from '../middleware/adminAuth.js';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-secure-random-string';

const breakGlassLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

function constantTimeCompare(a, b) {
  const key = crypto.randomBytes(32);
  const hmacA = crypto.createHmac('sha256', key).update(a).digest();
  const hmacB = crypto.createHmac('sha256', key).update(b).digest();
  return crypto.timingSafeEqual(hmacA, hmacB);
}

// POST /api/admin/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await req.db.queryOne(
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

    const token = jwt.sign(
      { adminId: user.id, role: user.role, email: user.email, displayName: user.display_name },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

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
router.get('/me', adminAuth, async (req, res, next) => {
  try {
    const user = await req.db.queryOne(
      'SELECT id, email, display_name, role, created_at FROM admin_users WHERE id = $1',
      [req.adminUser.id]
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
router.post('/change-password', adminAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await req.db.queryOne('SELECT * FROM admin_users WHERE id = $1', [req.adminUser.id]);
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

export default router;
