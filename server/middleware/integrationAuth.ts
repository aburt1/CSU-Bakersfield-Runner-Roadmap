import bcrypt from 'bcrypt';
import type { Request, Response, NextFunction } from 'express';

function getIntegrationCredential(req: Request): string | null {
  const headerKey = req.headers['x-integration-key'];
  if (headerKey) return String(headerKey).trim();

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export async function integrationAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const credential = getIntegrationCredential(req);
  if (!credential) {
    res.status(401).json({ error: 'Integration authentication required' });
    return;
  }

  const clients = await req.db.queryAll<{ id: number; name: string; key_hash: string; is_active: number }>(
    `SELECT id, name, key_hash, is_active
     FROM integration_clients
     WHERE is_active = 1`
  );

  for (const client of clients) {
    const match = await bcrypt.compare(credential, client.key_hash);
    if (match) {
      req.integrationClient = {
        id: client.id,
        name: client.name,
      };
      return next();
    }
  }

  res.status(401).json({ error: 'Invalid integration credentials' });
  return;
}
