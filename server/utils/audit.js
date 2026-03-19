export function getAuditActor(req) {
  if (req.integrationClient?.name) return req.integrationClient.name;
  if (req.studentUser?.displayName) return req.studentUser.displayName;
  if (req.studentUser?.email) return req.studentUser.email;
  if (req.adminUser?.displayName) return req.adminUser.displayName;
  if (req.adminUser?.email) return req.adminUser.email;
  if (req.studentEmail) return req.studentEmail;
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
