export function getAuditActor(req) {
  if (req.integrationClient?.name) return req.integrationClient.name;
  if (req.adminUser?.displayName) return req.adminUser.displayName;
  if (req.adminUser?.email) return req.adminUser.email;
  return 'system';
}

export function logAudit(db, req, { entityType, entityId, action, details }) {
  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    entityType,
    String(entityId),
    action,
    getAuditActor(req),
    details ? JSON.stringify(details) : null
  );
}
