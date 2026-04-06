import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { requireRole } from '../../middleware/requireRole.js';
import { logAudit } from '../../utils/audit.js';
import { paramBuilder } from '../../db/pool.js';
import type { AdminUser } from '../../types/models.js';

const router = Router();

// GET /api/admin/users
router.get('/users', requireRole('sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await req.db.queryAll<Omit<AdminUser, 'password_hash'>>(
      'SELECT id, email, display_name, role, is_active, created_at FROM admin_users ORDER BY created_at'
    );
    res.json(users);
  } catch (err) { next(err); }
});

// POST /api/admin/users
router.post('/users', requireRole('sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, role, displayName } = req.body;

    if (!email || !displayName) {
      return res.status(400).json({ error: 'email and displayName required' });
    }
    const validRoles = ['viewer', 'admissions', 'admissions_editor', 'sysadmin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const existing = await req.db.queryOne<{ id: number }>('SELECT id FROM admin_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Generate an unusable random hash — admin users authenticate via SSO or break-glass only
    const hashSource = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(hashSource, 10);
    const result = await req.db.execute(
      'INSERT INTO admin_users (email, password_hash, role, display_name) VALUES ($1, $2, $3, $4) RETURNING id',
      [email.toLowerCase().trim(), hash, role || 'viewer', displayName]
    );

    const newId = (result.rows[0] as { id: number }).id;
    await logAudit(req.db, req, {
      entityType: 'admin_user',
      entityId: newId,
      action: 'admin_create',
      details: { email, role: role || 'viewer', displayName },
    });

    res.json({ success: true, id: newId });
  } catch (err) { next(err); }
});

// PUT /api/admin/users/:id
router.put('/users/:id', requireRole('sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const user = await req.db.queryOne<AdminUser>('SELECT id, email, role, display_name, is_active, azure_id, created_at FROM admin_users WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const { role, displayName, is_active } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    const p = paramBuilder();

    if (role !== undefined) {
      const validRoles = ['viewer', 'admissions', 'admissions_editor', 'sysadmin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      }
      // Prevent demoting the last active sysadmin
      if (role !== 'sysadmin' && user.role === 'sysadmin') {
        const sysadminCount = await req.db.queryOne<{ count: string }>(
          'SELECT COUNT(*) as count FROM admin_users WHERE role = $1 AND is_active = 1 AND id != $2',
          ['sysadmin', id]
        );
        if (parseInt(sysadminCount!.count) === 0) {
          return res.status(409).json({ error: 'Cannot demote the last active sysadmin' });
        }
      }
      updates.push(`role = ${p.next()}`);
      values.push(role);
    }
    if (displayName !== undefined) {
      updates.push(`display_name = ${p.next()}`);
      values.push(displayName);
    }
    if (is_active !== undefined) {
      // Prevent self-deactivation
      if (!is_active && id === req.adminUser!.id) {
        return res.status(409).json({ error: 'Cannot deactivate your own account' });
      }
      // Prevent deactivating the last active sysadmin
      if (!is_active && user.role === 'sysadmin') {
        const sysadminCount = await req.db.queryOne<{ count: string }>(
          'SELECT COUNT(*) as count FROM admin_users WHERE role = $1 AND is_active = 1 AND id != $2',
          ['sysadmin', id]
        );
        if (parseInt(sysadminCount!.count) === 0) {
          return res.status(409).json({ error: 'Cannot deactivate the last active sysadmin' });
        }
      }
      updates.push(`is_active = ${p.next()}`);
      values.push(is_active ? 1 : 0);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await req.db.execute(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ${p.next()}`, values);

    await logAudit(req.db, req, {
      entityType: 'admin_user',
      entityId: id,
      action: 'admin_update',
      details: { email: user.email, fields: Object.keys(req.body) },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
