import { normalizeStepKey } from './stepKeys.js';

export function normalizeStudentIdNumber(value) {
  return String(value || '').trim();
}

export function normalizeCompletedAt(value) {
  if (value == null || value === '') return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function resolveStudentByStudentIdNumber(db, studentIdNumber) {
  const normalized = normalizeStudentIdNumber(studentIdNumber);
  if (!normalized) {
    return { errorCode: 'invalid_student_id_number', error: 'student_id_number is required' };
  }

  const rows = db.prepare(`
    SELECT id, display_name, email, emplid, term_id
    FROM students
    WHERE trim(COALESCE(emplid, '')) = ?
  `).all(normalized);

  if (rows.length === 0) {
    return { errorCode: 'student_not_found', error: 'Student not found' };
  }

  if (rows.length > 1) {
    return { errorCode: 'duplicate_student_id_number', error: 'Student ID # is not unique' };
  }

  return { student: rows[0], studentIdNumber: normalized };
}

export function resolveStepForStudentByKey(db, student, stepKey) {
  const normalizedStepKey = normalizeStepKey(stepKey);
  if (!normalizedStepKey) {
    return { errorCode: 'invalid_step_key', error: 'step_key is required' };
  }

  if (!student?.term_id) {
    return { errorCode: 'student_term_missing', error: 'Student does not have an assigned term' };
  }

  const step = db.prepare(`
    SELECT id, title, term_id, step_key, is_active
    FROM steps
    WHERE term_id = ? AND step_key = ?
  `).get(student.term_id, normalizedStepKey);

  if (!step) {
    return { errorCode: 'step_not_found', error: 'Step not found in the student term' };
  }

  if (step.is_active === 0) {
    return { errorCode: 'step_inactive', error: 'Step is inactive' };
  }

  return { step, stepKey: normalizedStepKey };
}

export function applyStudentProgressChange(db, { studentId, stepId, status, note, completedAt } = {}) {
  const nextStatus = status === 'waived' ? 'waived' : status === 'not_completed' ? 'not_completed' : 'completed';
  const normalizedNote = note == null || note === '' ? null : String(note);
  const explicitCompletedAt = completedAt === undefined ? undefined : normalizeCompletedAt(completedAt);

  if (completedAt !== undefined && !explicitCompletedAt) {
    return { error: 'completed_at must be a valid ISO timestamp' };
  }

  const current = db.prepare(`
    SELECT student_id, step_id, completed_at, status, note
    FROM student_progress
    WHERE student_id = ? AND step_id = ?
  `).get(studentId, stepId);

  if (nextStatus === 'not_completed') {
    if (!current) {
      return { result: 'noop', status: 'not_completed', completedAt: null };
    }

    db.prepare(`
      DELETE FROM student_progress
      WHERE student_id = ? AND step_id = ?
    `).run(studentId, stepId);

    return { result: 'updated', status: 'not_completed', completedAt: null };
  }

  if (current) {
    const nextCompletedAt = explicitCompletedAt ?? current.completed_at ?? new Date().toISOString();
    const isSameCompletedAt = completedAt === undefined || current.completed_at === explicitCompletedAt;

    if (
      current.status === nextStatus &&
      (current.note ?? null) === normalizedNote &&
      isSameCompletedAt
    ) {
      return { result: 'noop', status: nextStatus, completedAt: current.completed_at };
    }

    db.prepare(`
      UPDATE student_progress
      SET status = ?, note = ?, completed_at = ?
      WHERE student_id = ? AND step_id = ?
    `).run(nextStatus, normalizedNote, nextCompletedAt, studentId, stepId);

    return { result: 'updated', status: nextStatus, completedAt: nextCompletedAt };
  }

  const nextCompletedAt = explicitCompletedAt ?? new Date().toISOString();
  db.prepare(`
    INSERT INTO student_progress (student_id, step_id, completed_at, status, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(studentId, stepId, nextCompletedAt, nextStatus, normalizedNote);

  return { result: 'created', status: nextStatus, completedAt: nextCompletedAt };
}
