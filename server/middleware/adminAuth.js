import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-secure-random-string';

/**
 * Admin authentication middleware.
 * Supports JWT Bearer tokens (primary) and legacy API key (backward compat).
 */
export function adminAuth(req, res, next) {
  // Try JWT Bearer token first
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload.adminId) {
        req.adminUser = {
          id: payload.adminId,
          role: payload.role,
          email: payload.email,
          displayName: payload.displayName,
        };
        return next();
      }
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Fallback: legacy API key (treated as superadmin)
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    req.adminUser = {
      id: 0,
      role: 'sysadmin',
      email: 'api-key',
      displayName: 'API Key Admin',
    };
    return next();
  }

  return res.status(401).json({ error: 'Authentication required' });
}
