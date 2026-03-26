import type { Db } from '../types/db.js';
import type { AuditEntry } from '../types/api.js';

interface AuditRequest {
  integrationClient?: { name: string } | null;
  studentUser?: { displayName?: string; email?: string } | null;
  adminUser?: { displayName?: string; email?: string } | null;
  studentEmail?: string;
}

export function getAuditActor(req: AuditRequest): string {
  if (req.integrationClient?.name) return req.integrationClient.name;
  if (req.studentUser?.displayName) return req.studentUser.displayName;
  if (req.studentUser?.email) return req.studentUser.email;
  if (req.adminUser?.displayName) return req.adminUser.displayName;
  if (req.adminUser?.email) return req.adminUser.email;
  if (req.studentEmail) return req.studentEmail;
  return 'system';
}

export async function logAudit(db: Db, req: AuditRequest, { entityType, entityId, action, details }: AuditEntry): Promise<void> {
  await db.execute(
    `INSERT INTO audit_log (entity_type, entity_id, action, changed_by, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      entityType,
      String(entityId),
      action,
      getAuditActor(req),
      details ? JSON.stringify(details) : null,
    ]
  );
}
