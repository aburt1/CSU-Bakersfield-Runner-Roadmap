import bcrypt from 'bcrypt';

function getIntegrationCredential(req) {
  const headerKey = req.headers['x-integration-key'];
  if (headerKey) return String(headerKey).trim();

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export function integrationAuth(req, res, next) {
  const credential = getIntegrationCredential(req);
  if (!credential) {
    return res.status(401).json({ error: 'Integration authentication required' });
  }

  const clients = req.db.prepare(`
    SELECT id, name, key_hash, is_active
    FROM integration_clients
    WHERE is_active = 1
  `).all();

  for (const client of clients) {
    if (bcrypt.compareSync(credential, client.key_hash)) {
      req.integrationClient = {
        id: client.id,
        name: client.name,
      };
      return next();
    }
  }

  return res.status(401).json({ error: 'Invalid integration credentials' });
}
