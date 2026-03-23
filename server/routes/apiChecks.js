import express from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { encrypt, decrypt, isEncryptionConfigured } from '../utils/encryption.js';
import { testApiCheck, validateUrl } from '../utils/apiCheckRunner.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(adminAuth);
router.use(requireRole('sysadmin'));

const MASKED = '••••••••';

// GET /api/admin/steps/:id/api-check
router.get('/steps/:id/api-check', async (req, res) => {
  try {
    const check = await req.db.queryOne(
      'SELECT * FROM step_api_checks WHERE step_id = $1',
      [req.params.id]
    );

    if (!check) {
      return res.json({ configured: false });
    }

    // Mask credentials
    const result = { ...check, configured: true };
    if (result.auth_credentials) {
      result.auth_credentials = MASKED;
    }
    if (result.headers) {
      try {
        result.headers = JSON.parse(result.headers);
      } catch { /* return as-is */ }
    }

    res.json(result);
  } catch (err) {
    console.error('[get-api-check]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/steps/:id/api-check
router.put('/steps/:id/api-check', async (req, res) => {
  try {
    const { url, response_field_path, http_method, auth_type, auth_credentials, headers,
            student_param_name, student_param_source, is_enabled } = req.body;

    if (!url || !response_field_path) {
      return res.status(400).json({ error: 'url and response_field_path are required' });
    }

    // Validate URL format (use configured placeholder name, default to 'studentId')
    try {
      const paramName = student_param_name || 'studentId';
      new URL(url.replace(new RegExp(`\\{\\{${paramName}\\}\\}`, 'g'), 'test'));
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const method = (http_method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) {
      return res.status(400).json({ error: 'http_method must be GET or POST' });
    }

    const aType = auth_type || 'none';
    if (!['none', 'basic', 'bearer'].includes(aType)) {
      return res.status(400).json({ error: 'auth_type must be none, basic, or bearer' });
    }

    // Handle credentials — encrypt if new, preserve if masked
    let encryptedCreds = null;
    if (aType !== 'none' && auth_credentials && auth_credentials !== MASKED) {
      if (!isEncryptionConfigured()) {
        return res.status(500).json({ error: 'Encryption key not configured on server' });
      }
      encryptedCreds = encrypt(typeof auth_credentials === 'string' ? auth_credentials : JSON.stringify(auth_credentials));
    } else if (aType !== 'none' && auth_credentials === MASKED) {
      // Preserve existing credentials
      const existing = await req.db.queryOne(
        'SELECT auth_credentials FROM step_api_checks WHERE step_id = $1',
        [req.params.id]
      );
      encryptedCreds = existing?.auth_credentials || null;
    }

    const headersJson = headers ? (typeof headers === 'string' ? headers : JSON.stringify(headers)) : null;

    await req.db.execute(
      `INSERT INTO step_api_checks (step_id, is_enabled, http_method, url, auth_type, auth_credentials,
         headers, student_param_name, student_param_source, response_field_path, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (step_id) DO UPDATE SET
         is_enabled = $2, http_method = $3, url = $4, auth_type = $5, auth_credentials = $6,
         headers = $7, student_param_name = $8, student_param_source = $9, response_field_path = $10,
         updated_at = NOW()`,
      [
        req.params.id,
        is_enabled === true,
        method,
        url,
        aType,
        encryptedCreds,
        headersJson,
        student_param_name || 'studentId',
        student_param_source || 'emplid',
        response_field_path,
      ]
    );

    await logAudit(req.db, req, {
      entityType: 'step_api_check',
      entityId: req.params.id,
      action: 'upsert',
      details: { url, auth_type: aType, response_field_path },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[put-api-check]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/steps/:id/api-check
router.delete('/steps/:id/api-check', async (req, res) => {
  try {
    await req.db.execute(
      'DELETE FROM step_api_checks WHERE step_id = $1',
      [req.params.id]
    );

    await logAudit(req.db, req, {
      entityType: 'step_api_check',
      entityId: req.params.id,
      action: 'delete',
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[delete-api-check]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/steps/:id/api-check/test
router.post('/steps/:id/api-check/test', async (req, res) => {
  try {
    const { testStudentId } = req.body;
    if (!testStudentId) {
      return res.status(400).json({ error: 'testStudentId is required' });
    }

    const check = await req.db.queryOne(
      'SELECT * FROM step_api_checks WHERE step_id = $1',
      [req.params.id]
    );

    if (!check) {
      return res.status(404).json({ error: 'No API check configured for this step' });
    }

    const result = await testApiCheck(req.db, check, testStudentId);
    res.json(result);
  } catch (err) {
    console.error('[test-api-check]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
