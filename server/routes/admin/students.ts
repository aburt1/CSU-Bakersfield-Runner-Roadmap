import { Router, Request, Response, NextFunction } from 'express';
import { requireRole } from '../../middleware/requireRole.js';
import { safeJsonParse } from '../../utils/json.js';
import { logAudit } from '../../utils/audit.js';
import { applyStudentProgressChange } from '../../utils/progress.js';
import { getDerivedTags, getManualTags, getMergedTags } from '../../utils/studentTags.js';
import { paramBuilder } from '../../db/pool.js';
import { parseTermId, parsePagination } from '../../utils/queryHelpers.js';
import type { Student, StudentProgress, AuditLogEntry } from '../../types/models.js';

const router = Router();

// ─── Student Progress ────────────────────────────────────

// POST /api/admin/students/:studentId/steps/:stepId/complete (admissions+)
router.post('/students/:studentId/steps/:stepId/complete', requireRole('admissions', 'admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.params.studentId as string;
    const stepId = req.params.stepId as string;
    const step = parseInt(stepId, 10);
    const { note, status } = req.body || {};
    const progressStatus = status === 'waived' ? 'waived' : 'completed';

    const student = await req.db.queryOne<{ id: string; display_name: string }>('SELECT id, display_name FROM students WHERE id = $1', [studentId]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const stepRow = await req.db.queryOne<{ id: number; title: string; step_key: string }>('SELECT id, title, step_key FROM steps WHERE id = $1', [step]);
    if (!stepRow) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const progressChange = await applyStudentProgressChange(req.db, {
      studentId,
      stepId: step,
      status: progressStatus,
      note,
    });

    if (progressChange.error) {
      return res.status(400).json({ error: progressChange.error });
    }

    if (progressChange.result !== 'noop') {
      await logAudit(req.db, req, {
        entityType: 'student_progress',
        entityId: studentId,
        action: progressStatus === 'waived' ? 'waive' : 'complete',
        details: {
          stepId: step,
          stepKey: stepRow.step_key || null,
          stepTitle: stepRow.title,
          studentName: student.display_name,
          note: note || null,
          result: progressChange.result,
        },
      });
    }

    res.json({
      success: true,
      studentId,
      stepId: step,
      status: progressChange.status,
      result: progressChange.result,
      completedAt: progressChange.completedAt,
    });
  } catch (err) { next(err); }
});

// DELETE /api/admin/students/:studentId/steps/:stepId/complete (admissions+)
router.delete('/students/:studentId/steps/:stepId/complete', requireRole('admissions', 'admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.params.studentId as string;
    const stepId = req.params.stepId as string;
    const step = parseInt(stepId, 10);
    const { note } = req.body || {};

    const student = await req.db.queryOne<{ display_name: string }>('SELECT display_name FROM students WHERE id = $1', [studentId]);
    const stepRow = await req.db.queryOne<{ title: string; step_key: string }>('SELECT title, step_key FROM steps WHERE id = $1', [step]);

    const progressChange = await applyStudentProgressChange(req.db, {
      studentId,
      stepId: step,
      status: 'not_completed',
      note,
    });

    if (progressChange.error) {
      return res.status(400).json({ error: progressChange.error });
    }

    if (progressChange.result !== 'noop') {
      await logAudit(req.db, req, {
        entityType: 'student_progress',
        entityId: studentId,
        action: 'uncomplete',
        details: {
          stepId: step,
          stepKey: stepRow?.step_key || null,
          stepTitle: stepRow?.title,
          studentName: student?.display_name,
          note: note || null,
          result: progressChange.result,
        },
      });
    }

    res.json({ success: true, studentId, stepId: step, result: progressChange.result, status: progressChange.status });
  } catch (err) { next(err); }
});

// GET /api/admin/students/:studentId/progress
router.get('/students/:studentId/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.params.studentId as string;

    const student = await req.db.queryOne<Student>(
      `SELECT id, display_name, email, azure_id, tags, created_at, term_id,
              emplid, preferred_name, phone, applicant_type, major, residency, admit_term, last_synced_at
       FROM students WHERE id = $1`,
      [studentId]
    );
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const progress = await req.db.queryAll<StudentProgress & { title: string }>(
      `SELECT sp.step_id, sp.completed_at, sp.status, sp.note, s.title
       FROM student_progress sp
       JOIN steps s ON s.id = sp.step_id
       WHERE sp.student_id = $1
       ORDER BY sp.step_id`,
      [studentId]
    );

    res.json({
      student,
      manualTags: getManualTags(student),
      derivedTags: getDerivedTags(student),
      mergedTags: getMergedTags(student),
      progress,
    });
  } catch (err) { next(err); }
});

// PUT /api/admin/students/:studentId/profile (admissions+)
router.put('/students/:studentId/profile', requireRole('admissions', 'admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.params.studentId as string;
    const student = await req.db.queryOne<Student>(
      `SELECT id, display_name, email, emplid, preferred_name, phone,
              applicant_type, major, residency, admit_term, last_synced_at
       FROM students WHERE id = $1`,
      [studentId]
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const fields: string[] = [
      'display_name', 'email', 'emplid', 'preferred_name', 'phone',
      'applicant_type', 'major', 'residency', 'admit_term', 'last_synced_at',
    ];

    const updates: string[] = [];
    const values: unknown[] = [];
    const p = paramBuilder();

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ${p.next()}`);
        values.push(req.body[field] || null);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No profile fields to update' });
    }

    values.push(studentId);
    await req.db.execute(`UPDATE students SET ${updates.join(', ')} WHERE id = ${p.next()}`, values);

    await logAudit(req.db, req, {
      entityType: 'student_profile',
      entityId: studentId,
      action: 'student_profile_update',
      details: {
        studentName: student.display_name,
        emplid: req.body.emplid !== undefined ? req.body.emplid : student.emplid,
        fields: Object.keys(req.body),
      },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/admin/students/:studentId/tags (admissions+)
router.put('/students/:studentId/tags', requireRole('admissions', 'admissions_editor', 'sysadmin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.params.studentId as string;
    const { tags } = req.body;

    const student = await req.db.queryOne<{ id: string; tags: string | null; display_name: string }>('SELECT id, tags, display_name FROM students WHERE id = $1', [studentId]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const oldTags = safeJsonParse(student.tags, []);

    await req.db.execute(
      'UPDATE students SET tags = $1 WHERE id = $2',
      [Array.isArray(tags) ? JSON.stringify(tags) : null, studentId]
    );

    await logAudit(req.db, req, {
      entityType: 'student_tags',
      entityId: studentId,
      action: 'tags_update',
      details: { oldTags, newTags: tags || [], studentName: student.display_name || null },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/admin/students — paginated, with progress counts
router.get('/students', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, term_id, sort = 'date_desc', overdue_only } = req.query;
    const termId = term_id ? parseInt(term_id as string, 10) : null;
    const { page, perPage, offset } = parsePagination(req);

    const baseQuery = `
      SELECT s.id, s.display_name, s.email, s.azure_id, s.tags, s.created_at, s.term_id,
             s.emplid, s.applicant_type, s.major, s.residency, s.admit_term,
             COALESCE(pc.completed, 0) as completed_steps,
             COALESCE(ov.overdue_count, 0) as overdue_step_count
      FROM students s
      LEFT JOIN (
        SELECT student_id, COUNT(*) as completed
        FROM student_progress sp
        JOIN steps st_req ON st_req.id = sp.step_id AND COALESCE(st_req.is_optional, 0) = 0
        GROUP BY student_id
      ) pc ON pc.student_id = s.id
      LEFT JOIN (
        SELECT s2.id as student_id, COUNT(st.id) as overdue_count
        FROM students s2
        JOIN steps st ON st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0 AND st.deadline_date IS NOT NULL AND st.deadline_date < CURRENT_DATE::text
          AND (st.term_id = s2.term_id OR st.term_id IS NULL)
        LEFT JOIN student_progress sp ON sp.student_id = s2.id AND sp.step_id = st.id
        WHERE sp.student_id IS NULL
        GROUP BY s2.id
      ) ov ON ov.student_id = s.id
    `;

    const where: string[] = [];
    const params: unknown[] = [];
    const p = paramBuilder();

    if (search) {
      where.push(`(s.display_name ILIKE ${p.next()} OR s.email ILIKE ${p.next()} OR COALESCE(s.emplid, '') ILIKE ${p.next()} OR COALESCE(s.major, '') ILIKE ${p.next()})`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (termId) {
      where.push(`s.term_id = ${p.next()}`);
      params.push(termId);
    }
    if (overdue_only === '1') {
      where.push('COALESCE(ov.overdue_count, 0) > 0');
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Sort mapping
    const sortMap: Record<string, string> = {
      date_desc: 's.created_at DESC',
      date_asc: 's.created_at ASC',
      name_asc: 's.display_name ASC',
      name_desc: 's.display_name DESC',
      progress_asc: 'completed_steps ASC',
      progress_desc: 'completed_steps DESC',
    };
    const orderBy = sortMap[sort as string] || sortMap.date_desc;

    // Count query
    const totalResult = await req.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM (${baseQuery} ${whereClause}) sub`,
      params
    );
    const total = parseInt(totalResult!.count);

    // Data query
    const students = await req.db.queryAll<Student & { completed_steps: number; overdue_step_count: number }>(
      `${baseQuery} ${whereClause} ORDER BY ${orderBy} LIMIT ${p.next()} OFFSET ${p.next()}`,
      [...params, perPage, offset]
    );

    res.json({ students, total, page, per_page: perPage });
  } catch (err) { next(err); }
});

// GET /api/admin/students/overdue?term_id=
router.get('/students/overdue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const termFilter = termId ? 'AND st.term_id = $1' : '';
    const studentTermFilter = termId ? 'AND s.term_id = $2' : '';
    const params = termId ? [termId, termId] : [];

    const rows = await req.db.queryAll<{ id: string; display_name: string; email: string; overdue_count: string }>(
      `SELECT s.id, s.display_name, s.email,
        COUNT(st.id) as overdue_count
       FROM students s
       JOIN steps st ON st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0 AND st.deadline_date IS NOT NULL AND st.deadline_date < CURRENT_DATE::text ${termFilter}
       LEFT JOIN student_progress sp ON sp.student_id = s.id AND sp.step_id = st.id
       WHERE sp.student_id IS NULL ${studentTermFilter}
       GROUP BY s.id, s.display_name, s.email
       ORDER BY overdue_count DESC`,
      params
    );

    res.json(rows.map(r => ({ ...r, overdue_count: parseInt(r.overdue_count) })));
  } catch (err) { next(err); }
});

// ─── Audit Log ───────────────────────────────────────────

// GET /api/admin/audit
router.get('/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, entityType, action, changedBy, q, limit = '50', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit as string, 10) || 50, 200);
    const off = parseInt(offset as string, 10) || 0;

    const where: string[] = [];
    const params: unknown[] = [];
    const p = paramBuilder();

    if (studentId) {
      where.push(`entity_id = ${p.next()} AND entity_type IN ('student_progress', 'student_tags', 'student_profile')`);
      params.push(studentId);
    }
    if (entityType) {
      where.push(`entity_type = ${p.next()}`);
      params.push(entityType);
    }
    if (action) {
      where.push(`action = ${p.next()}`);
      params.push(action);
    }
    if (changedBy) {
      where.push(`changed_by ILIKE ${p.next()}`);
      params.push(`%${changedBy}%`);
    }
    if (q) {
      where.push(`(entity_type ILIKE ${p.next()} OR action ILIKE ${p.next()} OR changed_by ILIKE ${p.next()} OR COALESCE(details, '') ILIKE ${p.next()})`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalResult = await req.db.queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM audit_log ${whereClause}`, params);
    const total = parseInt(totalResult!.count);

    const logs = await req.db.queryAll<AuditLogEntry>(
      `SELECT * FROM audit_log ${whereClause} ORDER BY created_at DESC LIMIT ${p.next()} OFFSET ${p.next()}`,
      [...params, lim, off]
    );

    res.json({ logs, total });
  } catch (err) { next(err); }
});

export default router;
